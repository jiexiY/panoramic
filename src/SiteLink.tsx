import type { AnchorHTMLAttributes, MouseEvent } from "react";

export type Navigate = (to: string) => void;
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; navigate: Navigate };

export default function SiteLink({ to, navigate, children, onClick, ...props }: Props) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target || props.download) return;
    event.preventDefault();
    navigate(to);
  }
  return <a {...props} href={to} onClick={follow}>{children}</a>;
}
