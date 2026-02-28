export default function Toast({
  toast
}: {
  toast: { type: "success" | "error"; message: string } | null;
}) {
  if (!toast) return null;
  return <div className={`toast ${toast.type}`}>{toast.message}</div>;
}
