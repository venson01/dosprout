import { Bean, Flower2, Leaf, type LucideIcon, Sprout } from "lucide-react";

// The sign-up form's password meter, as a plant: a seed while it's too short, then a
// sprout, a leaf, and a flower for a long password with mixed characters.
// It only guides: the real rule is the minimum length (checked by the browser and the API).

interface Stage {
  icon: LucideIcon;
  text: string;
  /** Color of the filled bar pieces and the icon. */
  color: string;
}

/** 0 = nothing typed yet, 1 = too short, 2 = OK, 3 = strong, 4 = very strong. */
export function growthStage(password: string, minLength: number): number {
  if (!password) return 0;
  if (password.length < minLength) return 1;
  // How many kinds of characters: lowercase, uppercase, digits, symbols.
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((kind) => kind.test(password)).length;
  if (password.length >= 16 || (password.length >= 12 && kinds >= 3)) return 4;
  if (password.length >= 12 || kinds >= 3) return 3;
  return 2;
}

function stageInfo(stage: number, missing: number, minLength: number): Stage {
  switch (stage) {
    case 0:
      return { icon: Bean, text: `At least ${minLength} characters. Plant a seed!`, color: "text-muted" };
    case 1:
      return {
        icon: Bean,
        text: `A seed: ${missing} more character${missing === 1 ? "" : "s"} to sprout.`,
        color: "text-high",
      };
    case 2:
      return { icon: Sprout, text: "Sprouting! Longer or mixed characters grow it stronger.", color: "text-mid" };
    case 3:
      return { icon: Leaf, text: "Growing strong.", color: "text-low" };
    default:
      return { icon: Flower2, text: "In full bloom. That's a great password!", color: "text-low" };
  }
}

const BAR_COLORS = ["", "bg-high", "bg-mid", "bg-low", "bg-low"];

export function PasswordGrowth({ password, minLength }: { password: string; minLength: number }) {
  const stage = growthStage(password, minLength);
  const { icon: Icon, text, color } = stageInfo(stage, minLength - password.length, minLength);
  return (
    <div className="flex items-center gap-2.5">
      {/* key={stage}: a new icon pops in each time the plant grows. */}
      <Icon
        key={stage}
        aria-hidden
        className={`size-5 shrink-0 origin-bottom animate-pop big:size-6 huge:size-7 motion-reduce:animate-none ${color}`}
      />
      <div className="min-w-0 flex-1">
        <div aria-hidden className="flex gap-1">
          {[1, 2, 3, 4].map((piece) => (
            <span
              key={piece}
              className={`h-1 flex-1 rounded-full big:h-1.5 transition-colors duration-300 motion-reduce:transition-none ${
                piece <= stage ? BAR_COLORS[stage] : "bg-line"
              }`}
            />
          ))}
        </div>
        <p className="mt-1">{text}</p>
      </div>
    </div>
  );
}
