"use client";
// Quiz d'entrée d'une scène (Î13, `spec-extras-blender.md` §4, `spec-progression.md` §4). Chargé à la demande
// (`import()` dynamique par `BookApp`), hors du bundle de la page tant qu'aucune scène n'en demande un.
//
// Composant autonome : entrée `quiz` (`modules.quiz` de la scène, textes en 3 langues) et langue du fournisseur de
// traduction ; sorties `onPassed` (bonne réponse) et `onContinue` (« Passer »). Il ne lit ni n'écrit la progression :
// l'aperçu de l'atelier (A5) peut le monter tel quel.
//
// Une question, trois réponses (ordre du fichier), une seule correcte (contrat vérifié au build). Mauvaise réponse :
// « Essaie encore ! » annoncé, la réponse essayée est grisée et désactivée (Q3), on reste sur la question. Bonne réponse :
// `onPassed`, puis fenêtre modale (`Dialog`) avec l'explication et « Passer » ; Échap ou un clic sur le fond valent
// « Passer ». Cibles d'au moins 44 px.
import { useId, useState } from "react";
import Dialog from "@/components/ui/Dialog";
import { useTranslation } from "@/contexts/TranslationContext";
import type { QuizModule } from "@/schema/glbi";

export interface QuizProps {
  quiz: QuizModule;
  /** Titre affiché au-dessus de la question (nom de la scène dans la langue courante). */
  title?: string;
  /** Bonne réponse donnée (une fois). */
  onPassed?: () => void;
  /** « Passer » après l'explication. Absent : le quiz revient à son début (aperçu). */
  onContinue?: () => void;
}

export default function Quiz({ quiz, title, onPassed, onContinue }: QuizProps) {
  const { t, lang } = useTranslation();
  const [tried, setTried] = useState<number[]>([]);
  const [passed, setPassed] = useState(false);
  const questionId = useId();
  const doneId = useId();

  const choose = (i: number) => {
    if (passed) return;
    if (quiz.choices[i].correct) {
      setPassed(true);
      onPassed?.();
    } else if (!tried.includes(i)) {
      setTried([...tried, i]);
    }
  };

  const proceed = () => {
    if (onContinue) onContinue();
    else {
      setPassed(false);
      setTried([]);
    }
  };

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-5" aria-labelledby={questionId} data-testid="quiz">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">{t.quiz.kicker}</p>
      {title && <h1 className="text-2xl font-bold">{title}</h1>}
      <h2 id={questionId} className="text-xl font-semibold">
        {quiz.question[lang]}
      </h2>
      <div className="flex w-full flex-col gap-3" role="group" aria-labelledby={questionId}>
        {quiz.choices.map((c, i) => {
          const wrong = tried.includes(i);
          return (
            <button
              key={i}
              type="button"
              // `aria-disabled` plutôt que `disabled` : le focus reste sur la réponse essayée (clavier, lecteur d'écran).
              aria-disabled={wrong || undefined}
              onClick={() => choose(i)}
              className={`glbi-btn w-full px-6 py-3 text-lg ${wrong ? "bg-white/5 text-white/40 line-through" : "glbi-btn-secondary"}`}
              data-testid="quiz-choice"
            >
              {c.text[lang]}
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="min-h-7 text-lg font-semibold text-amber-300" data-testid="quiz-feedback">
        {tried.length > 0 && !passed ? t.quiz.tryAgain : ""}
      </p>

      <Dialog open={passed} onClose={proceed} labelledBy={doneId} className="glbi-dialog" testId="quiz-explanation">
        <div className="glbi-panel flex flex-col items-center gap-4 p-6 text-center">
          <h2 id={doneId} className="text-2xl font-bold">
            {t.quiz.correct}
          </h2>
          <p className="text-white/90">{quiz.explanation[lang]}</p>
          <button type="button" onClick={proceed} className="glbi-btn glbi-btn-primary px-8 py-3 text-lg" data-testid="quiz-continue">
            {t.quiz.skip}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
