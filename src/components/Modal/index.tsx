import { useState, useEffect, useRef } from "preact/hooks";
import { Icon } from "../Icon";
import { useFocusTrap } from "../../lib/useFocusTrap";
import type { VNode } from "preact";
import type { ComponentChildren } from "preact";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: ComponentChildren;
  size?: "sm" | "md" | "lg" | "xl";
  showClose?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  showClose = true,
}: ModalProps) {
  const dialogRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: Event) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay active" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className={`dialog dialog-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "dialog-title" : undefined}
      >
        {(title || showClose) && (
          <div className="dialog-header">
            {title && (
              <span id="dialog-title" className="dialog-title">
                {title}
              </span>
            )}
            {showClose && (
              <button
                className="dialog-close icon-btn"
                onClick={onClose}
                aria-label="Close dialog"
              >
                <Icon name="X" size={16} />
              </button>
            )}
          </div>
        )}
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      showClose={false}
    >
      {message ? <p className="dialog-message">{message}</p> : null}
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          {cancelText}
        </button>
        <button
          className={`btn btn-${danger ? "danger" : "primary"}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}

export interface PromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

function PromptDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Input",
  placeholder = "",
  defaultValue = "",
  confirmText = "OK",
  cancelText = "Cancel",
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      if (value.trim()) {
        onConfirm(value.trim());
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <input
        ref={inputRef}
        type="text"
        className="input"
        placeholder={placeholder}
        value={value}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
      />
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          {cancelText}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (value.trim()) {
              onConfirm(value.trim());
              onClose();
            }
          }}
          disabled={!value.trim()}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
