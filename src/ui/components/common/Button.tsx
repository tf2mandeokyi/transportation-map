import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'xs' | 'xxs';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[#18a0fb] text-white hover:bg-[#0d8ee0]',
  secondary: 'border border-neutral-300 bg-neutral-100 hover:bg-neutral-200',
  danger: 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'px-3 py-2',
  sm: 'px-2 py-1 text-[10px]',
  xs: 'px-1.5 py-1 text-[10px]',
  xxs: 'px-1.5 py-0.5 text-[10px] leading-[14px]',
};

export function buttonClass({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return [
    'cursor-pointer rounded font-medium disabled:cursor-not-allowed disabled:opacity-50',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? 'w-full' : '',
    className,
  ].filter(Boolean).join(' ');
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({ variant, size, fullWidth, className, ...rest }) => (
  <button className={buttonClass({ variant, size, fullWidth, className })} {...rest} />
);

export default Button;
