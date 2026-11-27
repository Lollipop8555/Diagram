import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Progressive enhancement: the install button only exists when the browser
 * actually offers installation (Chromium's `beforeinstallprompt`). Everywhere
 * else the app stays a plain web page.
 */
export function InstallButton({ label }: { label: string }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!prompt) return null;

  return (
    <button
      type="button"
      className="icon-btn"
      title={label}
      aria-label={label}
      onClick={async () => {
        setPrompt(null);
        await prompt.prompt();
      }}
    >
      <Download size={16} strokeWidth={1.8} />
    </button>
  );
}
