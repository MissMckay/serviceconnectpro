export default function AuthField({ id, label, children, className = "" }) {
  return (
    <div className={`auth-field ${className}`.trim()}>
      {label && (
        <label htmlFor={id} className="auth-field__label">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}
