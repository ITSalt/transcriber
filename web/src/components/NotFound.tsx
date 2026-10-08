import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/** Same page for someone else's and for a nonexistent resource (no existence leak). */
export function NotFound() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="not-found-page"
      className="container mx-auto flex flex-col items-start gap-4 px-4 py-16"
    >
      <h1 className="font-display text-3xl font-extrabold">
        {t("notFound.title")}
      </h1>
      <Button asChild>
        <Link to="/catalog">{t("notFound.back")}</Link>
      </Button>
    </div>
  );
}
