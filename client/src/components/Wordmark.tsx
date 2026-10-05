export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`}>
      Friendship{" "}
      <span className="bg-linear-to-r from-brand-rose via-brand-orange to-brand-gold bg-clip-text text-transparent">
        Wrapped
      </span>
    </span>
  );
}
