/**
 * Append file to media upload FormData with explicit UTF-8 display name for the backend.
 * @param {FormData} formData
 * @param {File} file
 */
export function appendMediaFileToFormData(formData, file) {
  const name = file?.name || "file";
  formData.append("file", file, name);
  formData.append("display_filename", name);
}
