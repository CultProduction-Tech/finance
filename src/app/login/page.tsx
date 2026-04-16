"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();

  const urlError = searchParams.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setError("Доступ для этого email запрещён");
        } else {
          setError(data.error || "Ошибка отправки");
        }
        return;
      }

      setSent(true);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f0f4f8" }}>
      <div className="w-full max-w-sm mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-bold text-black text-center">Финансовый дашборд</h1>

          {urlError === "expired" && (
            <div className="bg-amber-50 text-amber-800 text-sm rounded-lg p-3 mt-4 border border-amber-200">
              Ссылка истекла. Запросите новую.
            </div>
          )}
          {urlError === "invalid" && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mt-4 border border-red-200">
              Неверная ссылка. Запросите новую.
            </div>
          )}

          {sent ? (
            <div className="text-center mt-5">
              <p className="text-lg font-semibold text-black">Проверьте почту</p>
              <p className="text-sm text-neutral-500 mt-1">
                Ссылка отправлена на <span className="text-black font-medium">{email}</span>
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="text-sm text-[#008098] font-medium hover:underline mt-4"
              >
                Другой адрес
              </button>
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-sm text-neutral-500 text-center mb-4">Войдите с корпоративной почтой</p>
              <form onSubmit={handleSubmit}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.ru"
                  required
                  autoFocus
                  className="w-full px-4 py-3 border border-neutral-300 rounded-xl text-base text-black placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#008098]/30 focus:border-[#008098]"
                />
                {error && (
                  <p className="text-red-600 text-sm mt-2">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-3 py-3 rounded-xl font-semibold text-base text-white bg-[#008098] hover:bg-[#006d82] transition-colors disabled:opacity-50"
                >
                  {loading ? "Отправка..." : "Получить ссылку"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
