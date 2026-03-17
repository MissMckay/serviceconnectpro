export default function AuthInput({
  id,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
  disabled,
  autoComplete,
  rightIcon,
  rightButton,
  className = ""
}) {
  return (
    <div className={`auth-input-wrap ${rightIcon || rightButton ? "auth-input-wrap--has-right" : ""} ${className}`.trim()}>
      <input
        id={id}
        type={type}
        className="auth-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
      />
      {rightIcon && <span className="auth-input__icon" aria-hidden="true">{rightIcon}</span>}
      {rightButton && <span className="auth-input__action">{rightButton}</span>}
    </div>
  );
}
