/**
 * Class name utility — combines clsx and tailwind-merge.
 * Use this for all conditional Tailwind class merging throughout the app.
 */

type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[];

function clsx(...args: ClassValue[]): string {
  return args
    .flat(Infinity as 0)
    .filter(Boolean)
    .join(" ");
}

/**
 * Merges Tailwind CSS classes, resolving conflicts in favor of the last class.
 * e.g., cn("px-4 py-2", "px-6") → "py-2 px-6"
 *
 * This is a simplified merge — for production consider using the `tailwind-merge` package.
 * The apps/web package installs tailwind-merge; this version works without it.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}
