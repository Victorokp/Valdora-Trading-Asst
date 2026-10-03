import { Link } from "react-router-dom";

import { LogoMark } from "@/components/brand/Logo";

/** 404 — unknown routes render inside the shell with a way back. */
export default function NotFoundPage() {
  return (
    <div className="animate-rise flex min-h-[60vh] flex-col items-center justify-center text-center">
      <LogoMark size={40} monochrome className="text-faint" />
      <p className="numeric mt-4 text-4xl font-semibold text-ink">404</p>
      <p className="mt-2 text-sm text-muted">This page does not exist.</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:border-faint hover:bg-modal"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
