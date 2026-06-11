import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Drop-in replacement for a native <select>: same value/options/onChange
// contract, but rendered with the styled Radix dropdown (roomy white panel,
// soft shadow) instead of the unstylable OS menu.
//
// Radix forbids item value="" — common in native selects ("All sports") — so
// empty strings round-trip through a sentinel transparently.
const EMPTY = '__empty__';

export default function SelectMenu({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  disabled = false,
  id,
  triggerClassName = '',
  contentClassName = '',
}) {
  const toRadix = (raw) => (raw === '' ? EMPTY : String(raw));
  const fromRadix = (raw) => (raw === EMPTY ? '' : raw);

  return (
    <Select
      value={value === undefined || value === null ? undefined : toRadix(value)}
      onValueChange={(next) => onChange(fromRadix(next))}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem key={`${option.value}`} value={toRadix(option.value)} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
