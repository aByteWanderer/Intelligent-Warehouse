export default function WorkflowBar({
  steps,
  current,
  doneSet
}: {
  steps: string[];
  current: string;
  doneSet: Set<string>;
}) {
  return (
    <div className="workflow">
      {steps.map((s, idx) => (
        <div key={s} className={`wf-step ${doneSet.has(s) ? "done" : ""} ${s === current ? "current" : ""}`}>
          <span className="wf-dot">{idx + 1}</span>
          <span className="wf-text">{s}</span>
        </div>
      ))}
    </div>
  );
}
