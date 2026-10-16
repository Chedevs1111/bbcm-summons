/**
 * The eight starter templates, transcribed verbatim from the original
 * DivorceSummons AI bundle. These are seeded per firm on registration and are
 * then editable in the Template Designer.
 *
 * Selection rules mirror the original: a template matches a matter when its
 * document_type matches and each of marriage_regime / is_contested / has_children
 * is either null (any) or equal to the matter's value. More specific wins.
 */

import type { GeneratedDocumentType, MarriageRegime } from '@bbcm/schema';

export interface StarterTemplate {
  name: string;
  document_type: GeneratedDocumentType;
  marriage_regime: MarriageRegime | null;
  is_contested: boolean | null;
  has_children: boolean | null;
  is_default: boolean;
  body: string;
}

const SUMMONS_BODY = `{{C}}{{B}}{{COURT_HEADING}}{{/B}}{{/C}}

{{R}}CASE NO: {{CASE_NUMBER}}{{/R}}

In the matter between:

{{B}}{{PLAINTIFF_FULL_NAME}}{{/B}}{{R}}{{B}}PLAINTIFF{{/B}}{{/R}}
(ID NO: {{PLAINTIFF_ID}})

and

{{B}}{{DEFENDANT_FULL_NAME}}{{/B}}{{R}}{{B}}DEFENDANT{{/B}}{{/R}}
(ID NO: {{DEFENDANT_ID}})

══════════════════════════════════════════
{{C}}{{B}}{{U}}SUMMONS{{/U}}{{/B}}{{/C}}
══════════════════════════════════════════

TO: THE SHERIFF OR HIS DEPUTY

INFORM {{DEFENDANT_FULL_NAME}}, the Defendant herein, that the Plaintiff has instituted action against the Defendant in this Honourable Court for relief as set out in the attached Particulars of Claim.

DATED at {{COURT_LOCATION}} on this {{TODAY}}.

_______________________________________
PLAINTIFF'S ATTORNEYS
{{FIRM_NAME}}
{{FIRM_ADDRESS}}`;

const CONTESTED_SUMMONS_BODY = `{{C}}{{B}}{{COURT_HEADING}}{{/B}}{{/C}}

{{R}}CASE NO: {{CASE_NUMBER}}{{/R}}

In the matter between:

{{B}}{{PLAINTIFF_FULL_NAME}}{{/B}}{{R}}{{B}}PLAINTIFF{{/B}}{{/R}}
(ID NO: {{PLAINTIFF_ID}})

and

{{B}}{{DEFENDANT_FULL_NAME}}{{/B}}{{R}}{{B}}DEFENDANT{{/B}}{{/R}}
(ID NO: {{DEFENDANT_ID}})

══════════════════════════════════════════
{{C}}{{B}}{{U}}COMBINED SUMMONS{{/U}}{{/B}}{{/C}}
══════════════════════════════════════════

TO: THE SHERIFF OR HIS DEPUTY

{{B}}KINDLY SERVE{{/B}} the within Combined Summons, together with the Particulars of Claim and all annexures attached thereto, upon the Defendant at the following address:

{{DEFENDANT_ADDRESS}}

INFORM the Defendant that if the Defendant disputes the claim and wishes to defend the action, the Defendant must:

1. Within TEN (10) days of service hereof, file a Notice of Intention to Defend, and
2. Within TWENTY (20) days of filing such notice, deliver a Plea, Exception or Application to Strike Out.

TAKE NOTICE FURTHER that if the Defendant fails to do so, judgment may be granted against the Defendant without further notice.

DATED at {{COURT_LOCATION}} on this {{TODAY}}.

_______________________________________
PLAINTIFF'S ATTORNEYS
{{FIRM_NAME}}
{{FIRM_ADDRESS}}`;

const PARTICULARS_BASE = `{{C}}{{B}}{{COURT_HEADING}}{{/B}}{{/C}}

{{R}}CASE NO: {{CASE_NUMBER}}{{/R}}

══════════════════════════════════════════
{{C}}{{B}}{{U}}PARTICULARS OF CLAIM{{/U}}{{/B}}{{/C}}
══════════════════════════════════════════

1. The Plaintiff is {{PLAINTIFF_FULL_NAME}}, an adult {{PLAINTIFF_GENDER}} {{PLAINTIFF_OCCUPATION}}, with ID No {{PLAINTIFF_ID}}, residing at {{PLAINTIFF_ADDRESS}}.

2. The Defendant is {{DEFENDANT_FULL_NAME}}, an adult {{DEFENDANT_GENDER}} {{DEFENDANT_OCCUPATION}}, with ID No {{DEFENDANT_ID}}, residing at {{DEFENDANT_ADDRESS}}.

3. The parties were married to each other on {{MARRIAGE_DATE}} at {{MARRIAGE_PLACE}}, which marriage is {{MARRIAGE_REGIME}} and which marriage still subsists.

4. There {{CHILDREN_VERB}} {{NUMBER_OF_CHILDREN}} minor {{CHILDREN_NOUN}} born of the marriage, namely:
{{CHILDREN_LIST}}

5. The marriage relationship between the parties has irretrievably broken down.`;

const PARTICULARS_TAIL = `WHEREFORE the Plaintiff prays for an order in the following terms:
(a) A decree of divorce;
(b) Division of the joint estate / forfeiture as set out herein;
(c) Such further and/or alternative relief as this Honourable Court may deem just.

DATED at {{COURT_LOCATION}} on this {{TODAY}}.

_______________________________________
PLAINTIFF'S ATTORNEYS
{{FIRM_NAME}}`;

const IN_COMMUNITY_PARTICULARS_BODY = `${PARTICULARS_BASE}

6. The parties are married in community of property and the joint estate falls to be divided equally between them.

${PARTICULARS_TAIL}`;

const ACCRUAL_PARTICULARS_BODY = `${PARTICULARS_BASE}

6. The parties are married out of community of property with the inclusion of the accrual system in terms of the Matrimonial Property Act 88 of 1984.

7. The Plaintiff is entitled to a claim in respect of the accrual of the respective estates of the parties in terms of section 3 of the Matrimonial Property Act 88 of 1984, the extent of which is to be determined at the dissolution of the marriage.

${PARTICULARS_TAIL}`;

const SETTLEMENT_BODY_CHILDREN = `{{C}}{{B}}{{U}}SETTLEMENT AGREEMENT{{/U}}{{/B}}{{/C}}

ENTERED INTO BETWEEN:

{{B}}{{PLAINTIFF_FULL_NAME}}{{/B}}
(ID NO: {{PLAINTIFF_ID}})
("the Plaintiff")

AND

{{B}}{{DEFENDANT_FULL_NAME}}{{/B}}
(ID NO: {{DEFENDANT_ID}})
("the Defendant")

──────────────────────────────────────────
{{B}}1. PREAMBLE{{/B}}

1.1 The parties were married on {{MARRIAGE_DATE}} at {{MARRIAGE_PLACE}}.
1.2 The marriage regime is: {{MARRIAGE_REGIME}}.
1.3 There {{CHILDREN_VERB}} {{NUMBER_OF_CHILDREN}} minor {{CHILDREN_NOUN}} of the marriage.

{{B}}2. DIVORCE{{/B}}

The parties agree that a decree of divorce be granted on the terms set out herein.

{{B}}3. CARE OF MINOR CHILDREN{{/B}}

[Insert care and contact arrangements]

{{B}}4. PROPRIETARY CONSEQUENCES{{/B}}

[Insert proprietary terms]

──────────────────────────────────────────

{{TABLE}}{{TR}}{{TD}}
SIGNED at {{COURT_LOCATION}} on {{TODAY}}

_______________________________________
{{PLAINTIFF_FULL_NAME}}
PLAINTIFF
{{/TD}}{{TD}}
SIGNED at {{COURT_LOCATION}} on {{TODAY}}

_______________________________________
{{DEFENDANT_FULL_NAME}}
DEFENDANT
{{/TD}}{{/TR}}{{/TABLE}}`;

const SETTLEMENT_BODY_NO_CHILDREN = `{{C}}{{B}}{{U}}SETTLEMENT AGREEMENT{{/U}}{{/B}}{{/C}}

ENTERED INTO BETWEEN:

{{B}}{{PLAINTIFF_FULL_NAME}}{{/B}}
(ID NO: {{PLAINTIFF_ID}})
("the Plaintiff")

AND

{{B}}{{DEFENDANT_FULL_NAME}}{{/B}}
(ID NO: {{DEFENDANT_ID}})
("the Defendant")

──────────────────────────────────────────
{{B}}1. PREAMBLE{{/B}}

1.1 The parties were married on {{MARRIAGE_DATE}} at {{MARRIAGE_PLACE}}.
1.2 The marriage regime is: {{MARRIAGE_REGIME}}.
1.3 There are no minor children born of the marriage.

{{B}}2. DIVORCE{{/B}}

The parties agree that a decree of divorce be granted on the terms set out herein.

{{B}}3. PROPRIETARY CONSEQUENCES{{/B}}

[Insert proprietary terms]

──────────────────────────────────────────

{{TABLE}}{{TR}}{{TD}}
SIGNED at {{COURT_LOCATION}} on {{TODAY}}

_______________________________________
{{PLAINTIFF_FULL_NAME}}
PLAINTIFF
{{/TD}}{{TD}}
SIGNED at {{COURT_LOCATION}} on {{TODAY}}

_______________________________________
{{DEFENDANT_FULL_NAME}}
DEFENDANT
{{/TD}}{{/TR}}{{/TABLE}}`;

const INDEX_BODY = `{{C}}{{B}}{{COURT_HEADING}}{{/B}}{{/C}}

{{R}}CASE NO: {{CASE_NUMBER}}{{/R}}

In the matter between:

{{B}}{{PLAINTIFF_FULL_NAME}}{{/B}}{{R}}{{B}}PLAINTIFF{{/B}}{{/R}}

and

{{B}}{{DEFENDANT_FULL_NAME}}{{/B}}{{R}}{{B}}DEFENDANT{{/B}}{{/R}}

══════════════════════════════════════════
{{C}}{{B}}{{U}}INDEX{{/U}}{{/B}}{{/C}}
══════════════════════════════════════════

{{INDEX_ITEMS}}`;

const ANNEXURE_SCHEDULE_BODY = `{{C}}{{B}}{{U}}ANNEXURE SCHEDULE{{/U}}{{/B}}{{/C}}

{{R}}CASE NO: {{CASE_NUMBER}}{{/R}}

──────────────────────────────────────────
{{ANNEXURE_ITEMS}}
──────────────────────────────────────────

{{B}}NOTE:{{/B}} All annexures are true copies of the original documents. The originals are available for inspection at the offices of the Plaintiff's attorneys.`;

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: 'Standard Combined Summons',
    document_type: 'summons',
    marriage_regime: null,
    is_contested: false,
    has_children: null,
    is_default: true,
    body: SUMMONS_BODY,
  },
  {
    name: 'Contested Summons',
    document_type: 'summons',
    marriage_regime: null,
    is_contested: true,
    has_children: null,
    is_default: false,
    body: CONTESTED_SUMMONS_BODY,
  },
  {
    name: 'In Community Particulars',
    document_type: 'particulars_of_claim',
    marriage_regime: 'in_community',
    is_contested: false,
    has_children: null,
    is_default: false,
    body: IN_COMMUNITY_PARTICULARS_BODY,
  },
  {
    name: 'Accrual Particulars',
    document_type: 'particulars_of_claim',
    marriage_regime: 'out_of_community_with_accrual',
    is_contested: false,
    has_children: null,
    is_default: true,
    body: ACCRUAL_PARTICULARS_BODY,
  },
  {
    name: 'Standard Settlement (Children)',
    document_type: 'settlement_agreement',
    marriage_regime: null,
    is_contested: false,
    has_children: true,
    is_default: false,
    body: SETTLEMENT_BODY_CHILDREN,
  },
  {
    name: 'Standard Settlement (No Children)',
    document_type: 'settlement_agreement',
    marriage_regime: null,
    is_contested: false,
    has_children: false,
    is_default: true,
    body: SETTLEMENT_BODY_NO_CHILDREN,
  },
  {
    name: 'Standard Index Page',
    document_type: 'index_page',
    marriage_regime: null,
    is_contested: false,
    has_children: null,
    is_default: true,
    body: INDEX_BODY,
  },
  {
    name: 'Standard Annexure Schedule',
    document_type: 'annexure_schedule',
    marriage_regime: null,
    is_contested: false,
    has_children: null,
    is_default: true,
    body: ANNEXURE_SCHEDULE_BODY,
  },
];
