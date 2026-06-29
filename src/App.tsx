import { useEffect, useMemo, useState } from "react";
import civicsData from "../data/civics-questions-2025.json";

type StudyMode = "random" | "ordered" | "hard";
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
  revealed: boolean;
  search: string;
  seenQuestionIds: number[];
  hardQuestionIds: number[];
  knownQuestionIds: number[];
  hideKnownQuestions: boolean;
  theme: ThemePreference;
};

const questions: CivicsQuestion[] = civicsData.questions;
const storageKey = "naturalization-study-state-v1";
const defaultState: StoredState = {
  currentQuestionId: questions[0].id,
  mode: "random",
  revealed: false,
  search: "",
  seenQuestionIds: [],
  hardQuestionIds: [],
  knownQuestionIds: [],
  hideKnownQuestions: false,
  theme: "system",
};

function cleanStoredQuestionIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  return [...new Set(ids.filter((id): id is number => typeof id === "number"))];
}

function cleanStoredMode(mode: unknown): StudyMode {
  return mode === "ordered" || mode === "hard" ? mode : "random";
}

function loadStoredState(): StoredState {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return defaultState;
    }

    const parsed = JSON.parse(stored) as Partial<StoredState>;
    return {
      currentQuestionId:
        typeof parsed.currentQuestionId === "number"
          ? parsed.currentQuestionId
          : defaultState.currentQuestionId,
      mode: cleanStoredMode(parsed.mode),
      revealed: false,
      search: typeof parsed.search === "string" ? parsed.search : "",
      seenQuestionIds: cleanStoredQuestionIds(parsed.seenQuestionIds),
      hardQuestionIds: cleanStoredQuestionIds(parsed.hardQuestionIds),
      knownQuestionIds: cleanStoredQuestionIds(parsed.knownQuestionIds),
      hideKnownQuestions:
        typeof parsed.hideKnownQuestions === "boolean"
          ? parsed.hideKnownQuestions
          : defaultState.hideKnownQuestions,
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
  const hardQuestionIds = useMemo(
    () => new Set(state.hardQuestionIds),
    [state.hardQuestionIds],
  );
  const knownQuestionIds = useMemo(
    () => new Set(state.knownQuestionIds),
    [state.knownQuestionIds],
  );
  const normalizedSearch = state.search.trim().toLowerCase();
  const searchMatchedQuestions = useMemo(
    () =>
      normalizedSearch
        ? questions.filter((question) => matchesQuery(question, normalizedSearch))
        : questions,
    [normalizedSearch],
  );
  const hardQuestions = useMemo(
    () => questions.filter((question) => hardQuestionIds.has(question.id)),
    [hardQuestionIds],
  );
  const searchMatchedHardQuestions = useMemo(
    () => searchMatchedQuestions.filter((question) => hardQuestionIds.has(question.id)),
    [hardQuestionIds, searchMatchedQuestions],
  );
  const visibleMatchedQuestions = useMemo(
    () =>
      state.hideKnownQuestions
        ? searchMatchedQuestions.filter((question) => !knownQuestionIds.has(question.id))
        : searchMatchedQuestions,
    [knownQuestionIds, searchMatchedQuestions, state.hideKnownQuestions],
  );
  const hiddenKnownCount = state.hideKnownQuestions
    ? searchMatchedQuestions.length - visibleMatchedQuestions.length
    : 0;
  const hiddenKnownHardCount = state.hideKnownQuestions
    ? searchMatchedHardQuestions.filter((question) => knownQuestionIds.has(question.id)).length
    : 0;
  const hiddenKnownActiveCount =
    state.mode === "hard" ? hiddenKnownHardCount : hiddenKnownCount;
  const activeQuestions = useMemo(
    () =>
      state.mode === "hard"
        ? visibleMatchedQuestions.filter((question) => hardQuestionIds.has(question.id))
        : visibleMatchedQuestions,
    [hardQuestionIds, state.mode, visibleMatchedQuestions],
  );
  const currentQuestion =
    activeQuestions.find((question) => question.id === state.currentQuestionId) ??
    activeQuestions[0];
  const currentIndex = currentQuestion
    ? activeQuestions.findIndex((question) => question.id === currentQuestion.id)
    : -1;
  const unseenActiveQuestions = activeQuestions.filter(
    (question) => !seenQuestionIds.has(question.id),
  );
  const nextUnseenQuestions = unseenActiveQuestions.filter(
    (question) => question.id !== currentQuestion?.id,
  );
  const hasSearch = normalizedSearch.length > 0;
  const hasHardQuestions = hardQuestions.length > 0;
  const canGoNext = nextUnseenQuestions.length > 0;
  const activeQuestionIds = useMemo(
    () => new Set(activeQuestions.map((question) => question.id)),
    [activeQuestions],
  );
  const isCurrentQuestionHard = currentQuestion
    ? hardQuestionIds.has(currentQuestion.id)
    : false;
  const isCurrentQuestionKnown = currentQuestion
    ? knownQuestionIds.has(currentQuestion.id)
    : false;
  const activeSeenCount = activeQuestions.filter((question) =>
    seenQuestionIds.has(question.id),
  ).length;
  const canGoPrevious = currentQuestion
    ? state.mode === "ordered"
      ? activeQuestions.length > 1
      : state.seenQuestionIds.some(
          (id) => activeQuestionIds.has(id) && id !== currentQuestion.id,
        )
    : false;

  useEffect(() => {
    if (activeQuestions.length === 0) {
      return;
    }

    if (!activeQuestions.some((question) => question.id === state.currentQuestionId)) {
      setState((currentState) => ({
        ...currentState,
        currentQuestionId:
          currentState.mode === "ordered"
            ? activeQuestions[0].id
            : getRandomItem(activeQuestions).id,
        revealed: false,
      }));
    }
  }, [activeQuestions, state.currentQuestionId]);

  useEffect(() => {
    if (!currentQuestion) {
      return;
    }

    setState((currentState) => {
      if (currentState.seenQuestionIds.includes(currentQuestion.id)) {
        return currentState;
      }

      return {
        ...currentState,
        seenQuestionIds: [...currentState.seenQuestionIds, currentQuestion.id],
      };
    });
  }, [currentQuestion]);

  function updateState(update: Partial<StoredState>) {
    setState((currentState) => ({ ...currentState, ...update }));
  }

  function selectQuestion(questionId: number) {
    updateState({ currentQuestionId: questionId, revealed: false });
  }

  function updateSearch(search: string) {
    updateState({ search, revealed: false });
  }

  function getOrderedOffsetQuestion(offset: number): CivicsQuestion | undefined {
    if (activeQuestions.length === 0 || currentIndex < 0) {
      return undefined;
    }

    const nextIndex =
      (currentIndex + offset + activeQuestions.length) % activeQuestions.length;
    return activeQuestions[nextIndex];
  }

  function getNextUnseenOrderedQuestion(): CivicsQuestion | undefined {
    for (let offset = 1; offset < activeQuestions.length; offset += 1) {
      const candidate = getOrderedOffsetQuestion(offset);
      if (candidate && !seenQuestionIds.has(candidate.id)) {
        return candidate;
      }
    }

    return undefined;
  }

  function goToNextQuestion() {
    if (!currentQuestion || activeQuestions.length === 0 || nextUnseenQuestions.length === 0) {
      return;
    }

    if (state.mode === "ordered") {
      selectQuestion((getNextUnseenOrderedQuestion() ?? currentQuestion).id);
      return;
    }

    selectQuestion(getRandomItem(nextUnseenQuestions).id);
  }

  function goToPreviousQuestion() {
    if (!currentQuestion || activeQuestions.length === 0) {
      return;
    }

    if (state.mode === "ordered") {
      const previousQuestion = getOrderedOffsetQuestion(-1);
      if (previousQuestion) {
        selectQuestion(previousQuestion.id);
      }
      return;
    }

    const previousSeenQuestion = [...state.seenQuestionIds]
      .reverse()
      .map((id) => questions.find((question) => question.id === id))
      .find(
        (question) =>
          question && activeQuestionIds.has(question.id) && question.id !== currentQuestion.id,
      );

    if (previousSeenQuestion) {
      selectQuestion(previousSeenQuestion.id);
    }
  }

  function toggleCurrentQuestionHard() {
    if (!currentQuestion) {
      return;
    }

    setState((currentState) => {
      const alreadyHard = currentState.hardQuestionIds.includes(currentQuestion.id);
      return {
        ...currentState,
        hardQuestionIds: alreadyHard
          ? currentState.hardQuestionIds.filter((id) => id !== currentQuestion.id)
          : [...currentState.hardQuestionIds, currentQuestion.id],
      };
    });
  }

  function toggleCurrentQuestionKnown() {
    if (!currentQuestion) {
      return;
    }

    setState((currentState) => {
      const alreadyKnown = currentState.knownQuestionIds.includes(currentQuestion.id);
      return {
        ...currentState,
        knownQuestionIds: alreadyKnown
          ? currentState.knownQuestionIds.filter((id) => id !== currentQuestion.id)
          : [...currentState.knownQuestionIds, currentQuestion.id],
      };
    });
  }

  function resetSeenQuestions() {
    if (
      window.confirm(
        "Reset seen questions? This will clear your study progress on this device.",
      )
    ) {
      updateState({
        seenQuestionIds: currentQuestion ? [currentQuestion.id] : [],
        revealed: false,
      });
    }
  }

  const progressLabel =
    activeQuestions.length > 0 && currentIndex >= 0
      ? `${currentIndex + 1} of ${activeQuestions.length}`
      : "0 of 0";
  const emptyBecauseKnownHidden =
    activeQuestions.length === 0 &&
    state.hideKnownQuestions &&
    (state.mode === "hard" ? hiddenKnownHardCount > 0 : hiddenKnownCount > 0);
  const emptyTitle =
    state.mode === "hard" && !hasHardQuestions
      ? "No hard questions yet"
      : emptyBecauseKnownHidden
        ? "Known questions are hidden"
        : state.mode === "hard"
          ? "No matching hard questions"
          : "No matching questions";
  const emptyDescription =
    state.mode === "hard" && !hasHardQuestions
      ? "Mark questions as hard from Random or Ordered mode, then come back here to study them."
      : emptyBecauseKnownHidden
        ? state.mode === "hard"
          ? "Known hard questions are hidden. Show known questions to study them again."
          : "All matching questions are marked as known and hidden. Show known questions to study them again."
        : "Try clearing your search to see more questions.";

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
          <div className="rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            <div className="grid grid-cols-3">
              {(["random", "ordered", "hard"] as const).map((mode) => (
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
                  {mode === "random" ? "Random" : mode === "ordered" ? "Ordered" : "Hard"}
                </button>
              ))}
            </div>
          </div>
          <button
            aria-pressed={state.hideKnownQuestions}
            className={`mt-3 w-full rounded-2xl px-4 py-2.5 text-sm font-black transition ${
              state.hideKnownQuestions
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            }`}
            type="button"
            onClick={() => updateState({ hideKnownQuestions: !state.hideKnownQuestions })}
          >
            {state.hideKnownQuestions
              ? `Known questions hidden${
                  hiddenKnownCount > 0 ? ` (${hiddenKnownCount} hidden)` : ""
                }`
              : "Known questions shown"}
          </button>
        </section>

        <section className="flex flex-col rounded-3xl bg-white p-4 shadow-xl shadow-slate-300/70 transition-colors dark:bg-slate-900 dark:shadow-black/30 sm:p-6">
          {!currentQuestion ? (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <p className="text-lg font-black">{emptyTitle}</p>
              <p className="mt-2 max-w-sm text-sm font-semibold text-slate-500 dark:text-slate-400">
                {emptyDescription}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {hasSearch ? (
                  <button
                    className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
                    type="button"
                    onClick={() => updateSearch("")}
                  >
                    Clear search
                  </button>
                ) : null}
                {state.mode === "hard" && !hasHardQuestions ? (
                  <button
                    className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    type="button"
                    onClick={() => updateState({ mode: "random" })}
                  >
                    Study all questions
                  </button>
                ) : null}
                {emptyBecauseKnownHidden ? (
                  <button
                    className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    type="button"
                    onClick={() => updateState({ hideKnownQuestions: false })}
                  >
                    Show known questions
                  </button>
                ) : null}
              </div>
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
                {isCurrentQuestionHard ? (
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                    Hard
                  </span>
                ) : null}
                {isCurrentQuestionKnown ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    Known
                  </span>
                ) : null}
              </div>

              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {currentQuestion.category} / {currentQuestion.section}
              </p>
              <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight sm:text-4xl">
                {currentQuestion.question}
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className={`rounded-2xl px-4 py-2.5 text-sm font-black transition ${
                    isCurrentQuestionHard
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                  type="button"
                  onClick={toggleCurrentQuestionHard}
                >
                  {isCurrentQuestionHard ? "Marked as hard" : "Mark as hard"}
                </button>
                <button
                  className={`rounded-2xl px-4 py-2.5 text-sm font-black transition ${
                    isCurrentQuestionKnown
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                  type="button"
                  onClick={toggleCurrentQuestionKnown}
                >
                  {isCurrentQuestionKnown ? "Marked as known" : "Mark as known"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-4">
                <button
                  className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                  type="button"
                  onClick={goToPreviousQuestion}
                  disabled={!canGoPrevious}
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
                Seen {activeSeenCount} of {activeQuestions.length}{" "}
                {state.mode === "hard" ? "hard" : "matching"} questions
                {hiddenKnownActiveCount > 0
                  ? `. ${hiddenKnownActiveCount} known ${
                      hiddenKnownActiveCount === 1 ? "question is" : "questions are"
                    } hidden.`
                  : ""}
                {unseenActiveQuestions.length === 0
                  ? ". All active questions have been seen."
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

          {hasSearch && activeQuestions.length > 0 ? (
            <>
              <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {activeQuestions.length} search results
              </h2>
              {hiddenKnownActiveCount > 0 ? (
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {hiddenKnownActiveCount} known{" "}
                  {hiddenKnownActiveCount === 1 ? "question is" : "questions are"} hidden.
                </p>
              ) : null}
              <div className="mt-2 max-h-40 space-y-2 overflow-auto pr-1">
                {activeQuestions.map((question) => (
                  <button
                    className={`w-full rounded-2xl p-2.5 text-left transition ${
                      question.id === currentQuestion?.id
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
