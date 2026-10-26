// A known draft is handed off to the cabinet even if submit fails: never create a second draft on retry.
export async function sendChatApplication(api, payload) {
  const draft = await api.createApplication(payload);
  try {
    const submitted = await api.submitApplication(draft.applicationId);
    return { application: { ...draft, ...submitted }, submitted: true, failure: null };
  } catch (failure) {
    return { application: draft, submitted: false, failure };
  }
}
