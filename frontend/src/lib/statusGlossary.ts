export const STATUS_GLOSSARY: Record<string, {
    meaning: string
    typical: string
    forum: string
  }> = {
    "Submitted to Journal": {
      meaning: "Your manuscript has been received and is awaiting assignment to a Handling Editor. This is a system-level status — no human has reviewed your paper yet.",
      typical: "1–3 days.",
      forum: "Rarely discussed — this stage is very short and automated.",
    },
    "With Editor": {
      meaning: "The Handling Editor (HE) is performing desk review and/or actively inviting peer reviewers. T&F's published 'average first decision' includes fast desk rejections, so the stated number is misleadingly low for papers going to full review.",
      typical: "14–30 days typical. Beyond 30 days almost always means reviewer hunting.",
      forum: "The #1 complaint on r/academia. Authors report 2–3 month stalls at T&F journals in 2025.",
    },
    "Under Review": {
      meaning: "Reviewers have accepted invitations and are reading your manuscript. T&F officially gives reviewers 30 days; one late reviewer holds up the entire process.",
      typical: "42–70 days (6–10 weeks). Beyond 70 days warrants a polite inquiry.",
      forum: "Usually uneventful. Delays mean a reviewer missed their deadline.",
    },
    "Required Reviews Complete": {
      meaning: "All required reviewer reports have been submitted. The Associate Editor is synthesising them and preparing a recommendation for the Editor-in-Chief.",
      typical: "7–21 days.",
      forum: "Good sign — decision is imminent. No action needed.",
    },
    "Decision in Process": {
      meaning: "The EIC has the AE's recommendation and is writing the final editorial decision letter.",
      typical: "3–14 days. Usually the shortest active stage.",
      forum: "You are very close to a decision. Sit tight.",
    },
    "Minor Revision": {
      meaning: "Minor revisions requested. The paper is effectively accepted conditional on changes. Usually goes back only to the Handling Editor — not full re-review.",
      typical: "Author has 30–60 days to resubmit. Re-decision within 2–4 weeks.",
      forum: "Treat this as an accept. Address every reviewer point carefully.",
    },
    "Major Revision": {
      meaning: "Substantial revisions required. The revised manuscript will go back to the original reviewers for re-assessment.",
      typical: "Author has 60–90 days. Re-review takes 4–8 weeks after resubmission.",
      forum: "Not a rejection. Many papers accepted after major revision. Be thorough.",
    },
    "Revision Submitted": {
      meaning: "Your revised manuscript is back with the editor or reviewers for re-assessment.",
      typical: "Minor revision: 2–3 weeks. Major revision re-review: 4–6 weeks.",
      forum: "Progress is good — the journal accepted your revision attempt.",
    },
    "Accepted": {
      meaning: "Your paper has been accepted for publication. Production will contact you for proofs.",
      typical: "Proofs within 1–2 weeks. Online publication within 2–6 weeks depending on journal.",
      forum: "Congratulations. Check your journal's production timeline.",
    },
    "Rejected": {
      meaning: "The paper has been rejected. T&F offers a transfer service to affiliated journals for some authors — check the rejection letter.",
      typical: "Consider revising based on reviewer feedback before submitting elsewhere.",
      forum: "Very common. Rejection rate at most T&F journals is 60–85%.",
    },
    "Withdrawn": {
      meaning: "The submission was withdrawn by the author.",
      typical: "You can resubmit to another journal immediately — no embargo.",
      forum: "Often done when authors find a better-fit journal or editorial delays are unacceptable.",
    },
  }