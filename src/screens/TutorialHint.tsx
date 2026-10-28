/** Подсказка в первой партии; когда её убрать, решает useTutorial. */
export function TutorialHint() {
  return (
    <div className="tutorial" aria-hidden>
      <span className="tutorial-hand">👆</span>
      <p>Веди пальцем — самолёт летит следом</p>
    </div>
  );
}
