import { Section, Shot } from "../components/ui";

export function DraftImport() {
  return (
    <Section labelledBy="draft-title" className="bg-panel">
      <div className="grid items-center gap-8 lg:grid-cols-[2fr_3fr] lg:gap-14">
        <div>
          <h2 id="draft-title" className="heading-2">
            Продолжайте с того места, где остановились
          </h2>
          <p className="mt-5 body-lg">
            Откройте свой файл в Соавторе. В редакторе появятся знакомые сцены.
            Можно сразу вернуться к нужной реплике или попробовать другой финал
            в отдельном драфте.
          </p>
          <p className="mt-4 caption-1 text-muted-foreground">
            Импорт из Fountain, FDX, STARC, DOCX и TXT.
          </p>
        </div>
        <Shot
          name="workspace"
          alt="Навигатор сцен, открытый сценарий и чат Соавтора рядом с текстом."
          caption="Экран беты. Сценарий «Тихая вода» в редакторе."
        />
      </div>
    </Section>
  );
}
