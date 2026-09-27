"use client";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function PinInput({ value, onChange, disabled = false, label }: { value: string; onChange: (value: string) => void; disabled?: boolean; label: string }) {
  return <div className="pin-field">
    <span className="pin-label">{label}</span>
    <InputOTP
      aria-label={label}
      value={value}
      onChange={onChange}
      maxLength={6}
      inputMode="numeric"
      pattern="[0-9]*"
      disabled={disabled}
      containerClassName="pin-input"
    >
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map(index => <InputOTPSlot className="pin-slot" index={index} key={index} />)}
      </InputOTPGroup>
    </InputOTP>
  </div>;
}
