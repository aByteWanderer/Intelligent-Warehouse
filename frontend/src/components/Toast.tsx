export default function Toast({
  toast
}: {
  toast: { type: "success" | "error"; message: string } | null;
}) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.type}`}>
      <span>{toast.message}</span>
      {toast.type === "error" && (
        <button
          onClick={() => navigator.clipboard.writeText(toast.message)}
          style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }}
        >
          复制
        </button>
      )}
    </div>
  );
}
