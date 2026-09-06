/**
 * Populates a form property <select> and a filter <select> from a properties list.
 * The filter select must have `staticFilterCount` static options already in place
 * (e.g. "All" and "Company") — dynamic property entries are appended after them and
 * removed on each refresh so the static entries are never touched.
 */
export function populateScopeFilterOptions(formSelect, filterSelect, properties, staticFilterCount = 2) {
  formSelect.innerHTML = '<option value="">Select property</option>';
  Array.from(filterSelect.options).slice(staticFilterCount).forEach((opt) => opt.remove());
  properties.forEach((property) => {
    const option = document.createElement('option');
    option.value = property.id;
    option.textContent = property.title || 'Untitled property';
    formSelect.appendChild(option);
    const filterOption = option.cloneNode(true);
    filterOption.value = `property:${property.id}`;
    filterSelect.appendChild(filterOption);
  });
}
