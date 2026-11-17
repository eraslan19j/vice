import { GameApp } from "@/game/GameApp";

// No database ping on page load: it delayed first paint on slow connections and the game works without it.
export default function HomePage() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-neutral-950">
      <GameApp />
    </main>
  );
}
