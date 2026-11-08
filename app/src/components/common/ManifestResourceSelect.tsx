import React from 'react';
import { Select } from '@chakra-ui/react';
import { useScriptingManifestStore } from '../../store/useScriptingManifestStore';

interface ManifestResourceSelectProps {
  /** Resource list exported by Unity, such as "typewriterSound". */
  resourceType: string;
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  placeholder?: string;
}

/** Dropdown over a resource list in the Lua manifest that Unity exports. */
export const ManifestResourceSelect: React.FC<ManifestResourceSelectProps> = ({
  resourceType,
  value,
  onChange,
  placeholder = 'None',
}) => {
  const resources = useScriptingManifestStore((state) => state.manifest?.resources?.[resourceType]);
  const known = resources?.some((resource) => resource.id === value);
  return (
    <Select
      size="xs"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">{placeholder}</option>
      {value && !known && <option value={value}>Missing: {value}</option>}
      {resources?.map((resource) => (
        <option key={resource.id} value={resource.id}>
          {resource.description || resource.id}
        </option>
      ))}
    </Select>
  );
};
