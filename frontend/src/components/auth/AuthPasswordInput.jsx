import { useState } from "react";

const EyeOpen = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const EyeClosed = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4M9.9 5.1A10.7 10.7 0 0 1 12 5c5 0 9 4 10 7-0.4 1.2-1.2 2.5-2.3 3.6M6.2 6.2C4.2 7.6 2.8 9.6 2 12c1 3 5 7 10 7 1.6 0 3-.4 4.3-1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function AuthPasswordInput({
  id,
  placeholder,
  value,
  onChange,
  required,
  ariaLabel = "Show password",
  autoComplete = "off"
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-input-wrap auth-input-wrap--has-right auth-password-wrap">
      <input
        id={id}
        type={visible ? "text" : "password"}
        className="auth-input auth-input--password"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="auth-input__action auth-password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : ariaLabel}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeClosed /> : <EyeOpen />}
      </button>
    </div>
  );
}
