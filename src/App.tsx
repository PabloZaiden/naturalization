import { useEffect, useMemo, useState } from "react";
import civicsData from "../data/civics-questions-2025.json";

type StudyMode = "random" | "ordered";
type ThemePreference = "system" | "light" | "dark";

type CivicsQuestion = {
  id: number;
  question: string;
  answers: string[];
  special65_20: boolean;
  category: string;
  section: string;
  note?: string;
};

type StoredState = {
  currentQuestionId: number;
  mode: StudyMode;
  noRepeat: boolean;
  revealed: boolean;
  search: string;
  seenQuestionIds: number[];
  theme: ThemePreference;
};

const questions: CivicsQuestion[] = civicsData.questions;
const storageKey = "naturalization-study-state-v1";
const defaultState: StoredState = {
  currentQuestionId: questions[0].id,
  mode: "random",
  noRepeat: true,
  revealed: false,
  search: "",
  seenQuestionIds: [],
  theme: "system",
};

function loadStoredState(): StoredState {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return defaultState;
    }

    const parsed = JSON.parse(stored) as Partial<StoredState>;
    return {
      ...defaultState,
      ...parsed,
      currentQuestionId:
        typeof parsed.currentQuestionId === "number"
          ? parsed.currentQuestionId
          : defaultState.currentQuestionId,
      mode: parsed.mode === "ordered" ? "ordered" : "random",
      noRepeat: Boolean(parsed.noRepeat),
      revealed: false,
      search: typeof parsed.search === "string" ? parsed.search : "",
      seenQuestionIds: Array.isArray(parsed.seenQuestionIds)
        ? parsed.seenQuestionIds.filter((id): id is number => typeof id === "number")
        : [],
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : "system",
    };
  } catch (error) {
    console.warn("Unable to restore saved study progress.", error);
    return defaultState;
  }
}

function getRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function matchesQuery(question: CivicsQuestion, normalizedQuery: string): boolean {
  const searchableText = [
    question.id.toString(),
    question.question,
    question.category,
    question.section,
    ...question.answers,
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

function App() {
  const [state, setState] = useState<StoredState>(() => loadStoredState());

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme =
        state.theme === "system" ? (mediaQuery.matches ? "dark" : "light") : state.theme;

      document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);

    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [state.theme]);

  const seenQuestionIds = useMemo(
    () => new Set(state.seenQuestionIds),
    [state.seenQuestionIds],
  );
  const normalizedSearch = state.search.trim().toLowerCase();
  const filteredQuestions = useMemo(
    () =>
      normalizedSearch
        ? questions.filter((question) => matchesQuery(question, normalizedSearch))
        : questions,
    [normalizedSearch],
  );
  const currentQuestion =
    filteredQuestions.find((question) => question.id === state.currentQuestionId) ??
    filteredQuestions[0] ??
    questions[0];
  const currentIndex = filteredQuestions.findIndex(
    (question) => question.id === currentQuestion.id,
  );
  const unseenFilteredQuestions = filteredQuestions.filter(
    (question) => !seenQuestionIds.has(question.id),
  );
  const nextUnseenQuestions = unseenFilteredQuestions.filter(
    (question) => question.id !== currentQuestion.id,
  );
  const hasSearch = normalizedSearch.length > 0;
  const canGoNext = !state.noRepeat || nextUnseenQuestions.length > 0;

  useEffect(() => {
    if (filteredQuestions.length === 0) {
      return;
    }

    if (!filteredQuestions.some((question) => question.id === state.currentQuestionId)) {
      setState((currentState) => ({
        ...currentState,
        currentQuestionId:
          currentState.mode === "random"
            ? getRandomItem(filteredQuestions).id
            : filteredQuestions[0].id,
        revealed: false,
      }));
    }
  }, [filteredQuestions, state.currentQuestionId]);

  useEffect(() => {
    setState((currentState) => {
      if (currentState.seenQuestionIds.includes(currentQuestion.id)) {
        return currentState;
      }

      return {
        ...currentState,
        seenQuestionIds: [...currentState.seenQuestionIds, currentQuestion.id],
      };
    });
  }, [currentQuestion.id]);

  function updateState(update: Partial<StoredState>) {
    setState((currentState) => ({ ...currentState, ...update }));
  }

  function selectQuestion(questionId: number) {
    updateState({ currentQuestionId: questionId, revealed: false });
  }

  function updateSearch(search: string) {
    const normalizedQuery = search.trim().toLowerCase();
    const matches = normalizedQuery
      ? questions.filter((question) => matchesQuery(question, normalizedQuery))
      : questions;
    const currentQuestionMatches = matches.some(
      (question) => question.id === state.currentQuestionId,
    );

    updateState({
      search,
      currentQuestionId: currentQuestionMatches
        ? state.currentQuestionId
        : (matches[0]?.id ?? state.currentQuestionId),
      revealed: false,
    });
  }

  function getOrderedOffsetQuestion(offset: number): CivicsQuestion {
    const nextIndex =
      (currentIndex + offset + filteredQuestions.length) % filteredQuestions.length;
    return filteredQuestions[nextIndex];
  }

  function getNextUnseenOrderedQuestion(): CivicsQuestion | undefined {
    for (let offset = 1; offset < filteredQuestions.length; offset += 1) {
      const candidate = getOrderedOffsetQuestion(offset);
      if (!seenQuestionIds.has(candidate.id)) {
        return candidate;
      }
    }

    return undefined;
  }

  function goToNextQuestion() {
    if (filteredQuestions.length === 0) {
      return;
    }

    if (state.noRepeat && nextUnseenQuestions.length === 0) {
      return;
    }

    if (state.mode === "ordered") {
      selectQuestion(
        state.noRepeat
          ? (getNextUnseenOrderedQuestion() ?? currentQuestion).id
          : getOrderedOffsetQuestion(1).id,
      );
      return;
    }

    const candidates = state.noRepeat
      ? nextUnseenQuestions
      : filteredQuestions.filter((question) => question.id !== currentQuestion.id);
    selectQuestion(getRandomItem(candidates.length > 0 ? candidates : filteredQuestions).id);
  }

  function goToPreviousQuestion() {
    if (filteredQuestions.length === 0) {
      return;
    }

    if (state.mode === "ordered") {
      selectQuestion(getOrderedOffsetQuestion(-1).id);
      return;
    }

    const previousSeenQuestion = [...state.seenQuestionIds]
      .reverse()
      .map((id) => questions.find((question) => question.id === id))
      .find((question) => question && question.id !== currentQuestion.id);

    if (previousSeenQuestion) {
      selectQuestion(previousSeenQuestion.id);
    }
  }

  function resetSeenQuestions() {
    if (
      window.confirm(
        "Reset seen questions? This will clear your no-repeat progress on this device.",
      )
    ) {
      updateState({ seenQuestionIds: [currentQuestion.id], revealed: false });
    }
  }

  const progressLabel =
    filteredQuestions.length > 0
      ? `${currentIndex + 1} of ${filteredQuestions.length}`
      : "0 of 0";

  return (
    <main className="min-h-screen bg-slate-200 px-3 py-3 text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-50 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col gap-3">
        <header className="flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
              2025 USCIS Civics
            </p>
            <h1 className="text-xl font-black tracking-tight">Naturalization Study</h1>
          </div>
          <label className="shrink-0">
            <span className="sr-only">Theme</span>
            <select
              className="rounded-full border-0 bg-white px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm outline-none transition focus:ring-4 focus:ring-sky-100 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-sky-950"
              value={state.theme}
              onChange={(event) =>
                updateState({ theme: event.target.value as ThemePreference })
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </header>

        <section className="rounded-3xl bg-white p-3 shadow-lg shadow-slate-300/70 transition-colors dark:bg-slate-900 dark:shadow-black/30">
          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
              {(["random", "ordered"] as const).map((mode) => (
                <button
                  className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                    state.mode === mode
                      ? "bg-slate-950 text-white shadow dark:bg-white dark:text-slate-950"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                  key={mode}
                  type="button"
                  onClick={() => updateState({ mode })}
                >
                  {mode === "random" ? "Random" : "Ordered"}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <span className="hidden min-[360px]:inline">No repeats</span>
              <span className="min-[360px]:hidden">Unique</span>
              <input
                className="peer sr-only"
                checked={state.noRepeat}
                type="checkbox"
                onChange={(event) => updateState({ noRepeat: event.target.checked })}
              />
              <span className="relative h-6 w-11 rounded-full bg-slate-300 transition after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:bg-sky-600 peer-checked:after:translate-x-5 dark:bg-slate-700" />
            </label>
          </div>
        </section>

        <section className="flex flex-col rounded-3xl bg-white p-4 shadow-xl shadow-slate-300/70 transition-colors dark:bg-slate-900 dark:shadow-black/30 sm:p-6">
          {filteredQuestions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <p className="text-lg font-black">No matching questions</p>
              <button
                className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                type="button"
                onClick={() => updateSearch("")}
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                  Q{currentQuestion.id}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {progressLabel}
                </span>
                {currentQuestion.special65_20 ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    65/20
                  </span>
                ) : null}
              </div>

              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {currentQuestion.category} / {currentQuestion.section}
              </p>
              <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight sm:text-4xl">
                {currentQuestion.question}
              </h2>

              <div className="grid grid-cols-2 gap-2 pt-4">
                <button
                  className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                  type="button"
                  onClick={goToPreviousQuestion}
                  disabled={state.mode === "random" && state.seenQuestionIds.length <= 1}
                >
                  Previous
                </button>
                <button
                  className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40 dark:bg-white dark:text-slate-950"
                  type="button"
                  onClick={goToNextQuestion}
                  disabled={!canGoNext}
                >
                  Next question
                </button>
              </div>

              <div className="mt-3">
                <button
                  className="w-full rounded-2xl bg-sky-600 px-5 py-3 text-base font-black text-white shadow-lg shadow-sky-200 transition active:scale-[0.99] dark:bg-sky-500 dark:shadow-sky-950/40"
                  type="button"
                  onClick={() => updateState({ revealed: !state.revealed })}
                >
                  {state.revealed ? "Hide answers" : "Show valid answers"}
                </button>
              </div>

              {state.revealed ? (
                <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                  <h3 className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Valid answers
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {currentQuestion.answers.map((answer) => (
                      <li
                        className="rounded-2xl bg-white p-3 text-base font-semibold leading-snug shadow-sm dark:bg-slate-900"
                        key={answer}
                      >
                        {answer}
                      </li>
                    ))}
                  </ul>
                  {currentQuestion.note ? (
                    <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                      {currentQuestion.note}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <p className="mt-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                Seen {seenQuestionIds.size} of {questions.length} total questions
                {state.noRepeat && unseenFilteredQuestions.length === 0
                  ? ". All matching questions have been seen."
                  : ""}
              </p>
            </>
          )}
        </section>

        <section className="rounded-3xl bg-white p-3 shadow-lg shadow-slate-300/70 transition-colors dark:bg-slate-900 dark:shadow-black/30">
          <label className="sr-only" htmlFor="search">
            Search questions or answers
          </label>
          <input
            id="search"
            className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-base outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:bg-slate-950 dark:focus:ring-sky-950"
            placeholder="Search questions or answers"
            type="search"
            value={state.search}
            onChange={(event) => updateSearch(event.target.value)}
          />

          {hasSearch && filteredQuestions.length > 0 ? (
            <>
            <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {filteredQuestions.length} search results
            </h2>
            <div className="mt-2 max-h-40 space-y-2 overflow-auto pr-1">
              {filteredQuestions.map((question) => (
                <button
                  className={`w-full rounded-2xl p-2.5 text-left transition ${
                    question.id === currentQuestion.id
                      ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                      : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                  key={question.id}
                  type="button"
                  onClick={() => selectQuestion(question.id)}
                >
                  <span className="text-xs font-black">#{question.id}</span>
                  <span className="ml-2 text-sm font-bold leading-tight">
                    {question.question}
                  </span>
                </button>
              ))}
            </div>
            </>
          ) : null}
        </section>

        <div className="flex justify-end px-1">
          <button
            className="rounded-full px-2 py-1 text-[11px] font-bold text-slate-400 underline-offset-4 hover:text-slate-700 hover:underline dark:text-slate-500 dark:hover:text-slate-300"
            type="button"
            onClick={resetSeenQuestions}
          >
            Reset seen questions
          </button>
        </div>
      </div>
    </main>
  );
}

export default App;
