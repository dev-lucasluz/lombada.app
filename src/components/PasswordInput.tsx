import { useState, type InputHTMLAttributes } from "react";
import { Icon } from "./Icon";
import "./PasswordInput.css";

/** Campo de senha com botão para mostrar ou esconder o que foi digitado. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Esconder senha" : "Mostrar senha";
  return (
    <div className="password-field">
      <input {...props} className={`input ${props.className ?? ""}`} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        disabled={props.disabled}
      >
        <Icon name={visible ? "eyeOff" : "eye"} size={20} />
      </button>
    </div>
  );
}
