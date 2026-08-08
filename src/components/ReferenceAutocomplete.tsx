import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import type { ReferenceOption } from '../referenceData/travelReferences';

type Props = {
  label: string;
  value: string;
  options: ReferenceOption[];
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  error?: boolean;
};

export default function ReferenceAutocomplete({
  label,
  value,
  options,
  onChange,
  required = false,
  disabled = false,
  helperText,
  error,
}: Props) {
  const selected = React.useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  return (
    <Autocomplete
      options={options}
      value={selected}
      disabled={disabled}
      isOptionEqualToValue={(option, current) => option.value === current.value}
      getOptionLabel={(option) => `${option.label} (${option.value})`}
      onChange={(_event, option) => onChange(option?.value || '')}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          margin="normal"
          fullWidth
          required={required}
          error={error}
          helperText={helperText}
        />
      )}
      renderOption={(props, option) => (
        <li {...props}>
          <div>
            <div>{option.label}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {option.value}{option.subtitle ? ` - ${option.subtitle}` : ''}
            </div>
          </div>
        </li>
      )}
    />
  );
}
