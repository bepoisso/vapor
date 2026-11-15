import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import { commands } from "@/lib/bindings";
import page from "../GamePage.module.css";

interface CommunityTabProps {
  appId: number;
  kind: "guides" | "discussions";
}

/**
 * Guides and discussions live on Steam Community. Until Vapor has its own webview (planned with
 * the Store and Community areas), they open in the browser.
 */
export function CommunityTab({ appId, kind }: CommunityTabProps) {
  const { t } = useTranslation();
  return (
    <div className={`${page.panel} ${page.stack}`}>
      <p className={page.muted}>{t(`game.community.${kind}`)}</p>
      <div>
        <button
          type="button"
          className={`${buttons.base} ${buttons.small}`}
          onClick={() => void commands.openSteamPage(appId, kind).catch(() => undefined)}
        >
          {kind === "guides" ? t("game.community.openGuides") : t("game.community.openDiscussions")}
        </button>
      </div>
      <span className={page.label}>{t("game.community.browserNote")}</span>
    </div>
  );
}
