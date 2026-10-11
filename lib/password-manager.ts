// The Credential Management API is supported by some browsers. Password forms
// provide the standard autofill and save path in browsers without this API.
export const SHARED_NOTE_CREDENTIAL = "qidian-encrypted-notes";

export async function offerToSaveNotePassword(password: string): Promise<void> {
  const CredentialClass = (window as Window & {
    PasswordCredential?: new (data: { id: string; password: string; name: string }) => Credential;
  }).PasswordCredential;
  if (!CredentialClass || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new CredentialClass({
      id: SHARED_NOTE_CREDENTIAL,
      password,
      name: "栖点加密笔记",
    }));
  } catch {
    // Browser settings and user choice can decline the save prompt.
  }
}
