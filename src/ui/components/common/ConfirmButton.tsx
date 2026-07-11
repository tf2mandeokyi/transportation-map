import React, { useState } from 'react';
import Button, { ButtonSize, ButtonVariant } from './Button';

interface ConfirmButtonProps {
  onConfirm: () => void;
  // Skip the "are you sure" step entirely — e.g. nothing has been entered yet,
  // so there's nothing a confirm prompt would actually be protecting.
  skipConfirm?: boolean;
  label: string;
  prompt: string;
  confirmLabel?: string;
  keepLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

// Two-step "arm, then confirm" button used for anything destructive or that would
// discard in-progress work: first click swaps the button for an inline prompt in
// place, second click actually commits. One component for both senses so the
// interaction reads the same everywhere — canceling a session (Add Road/Station/RSE),
// deleting a station, or clearing saved data all use it instead of the browser's
// native confirm(), which isn't reliably available inside the Figma plugin iframe.
const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  onConfirm, skipConfirm = false, label, prompt,
  confirmLabel = 'Confirm', keepLabel = 'Never mind',
  variant = 'secondary', size, fullWidth = false, className,
}) => {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button variant={variant} size={size} fullWidth={fullWidth} className={className} onClick={() => skipConfirm ? onConfirm() : setArmed(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700 ${fullWidth ? 'w-full' : ''}`}>
      <span className="flex-1">{prompt}</span>
      <Button size="xs" variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      <Button size="xs" onClick={() => setArmed(false)}>{keepLabel}</Button>
    </div>
  );
};

export default ConfirmButton;
