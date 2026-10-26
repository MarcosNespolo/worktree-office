import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'default' | 'primary' | 'ghost';

interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

export function UiButton({
  variant = 'default',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: UiButtonProps) {
  return (
    <button
      type={type}
      className={`ui-btn ui-btn-${size} ${variant === 'default' ? '' : `ui-btn-${variant}`} ${className}`}
      {...props}
    />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label: string;
}

export function IconButton({
  icon,
  label,
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`ui-icon-btn ${className}`}
      {...props}
    >
      <span className="material-symbols-sharp" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
