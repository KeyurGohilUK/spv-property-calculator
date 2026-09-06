export const TEMPLATES = [
  {
    id: 'uk-property-purchase',
    icon: 'P',
    name: 'UK Property Purchase',
    description: 'From offer accepted through to legal completion.',
    scope: 'property',
    tasks: [
      { title: 'Confirm offer accepted in writing', description: 'Request written confirmation from the selling agent and note any conditions.' },
      { title: 'Instruct conveyancing solicitor', description: 'Appoint your solicitor and provide all required ID documents and proof of funds.' },
      { title: 'Submit mortgage application', description: 'Submit the full mortgage application to your lender with supporting documents.' },
      { title: 'Commission building survey', description: 'Arrange a RICS HomeBuyer Report or full structural survey before exchange.' },
      { title: 'Chase property searches', description: 'Local authority, water/drainage, and environmental searches — typically 2–6 weeks.' },
      { title: 'Review title report from solicitor', description: "Review your solicitor's report on title for any restrictions, covenants, or issues." },
      { title: 'Receive formal mortgage offer', description: 'Confirm the offer meets your requirements and review all conditions before proceeding.' },
      { title: 'Review and approve draft contract', description: 'Approve the draft contract with your solicitor and resolve any outstanding queries.' },
      { title: 'Exchange contracts', description: 'Pay the deposit (typically 10%) and agree a legal completion date.' },
      { title: 'Complete purchase', description: 'Funds transferred, keys collected, SDLT return filed within 14 days.' },
    ],
  },
  {
    id: 'spv-company-setup',
    icon: 'S',
    name: 'SPV Company Setup',
    description: 'Register and configure your UK special purpose vehicle.',
    scope: 'company',
    tasks: [
      { title: 'Incorporate SPV limited company at Companies House', description: 'Register online at gov.uk using SIC code 68100 — typically approved same day.' },
      { title: 'Open SPV business bank account', description: 'Apply with your Certificate of Incorporation, Memorandum and Articles, and director IDs.' },
      { title: 'Register with HMRC for Corporation Tax', description: 'Must be done within 3 months of starting to trade via the HMRC online portal.' },
      { title: 'Register directors for Self Assessment', description: 'Each director receiving salary or dividends must register with HMRC.' },
      { title: 'Appoint accountant and tax adviser', description: 'Engage one experienced with SPV property structures, CT600 filing, and Section 24 implications.' },
      { title: 'Set up bookkeeping system', description: 'Configure accounting software and chart of accounts appropriate for a property holding company.' },
      { title: 'File first confirmation statement', description: 'Annual Companies House requirement — due within 14 days of the incorporation anniversary.' },
    ],
  },
  {
    id: 'pre-offer-due-diligence',
    icon: 'D',
    name: 'Pre-Offer Due Diligence',
    description: 'Key checks to complete before committing to an offer.',
    scope: 'property',
    tasks: [
      { title: 'Review title register and title plan', description: 'Order from HMLR to verify ownership, boundaries, and any registered charges or restrictions.' },
      { title: 'Check flood and environmental risk', description: 'Use the Environment Agency flood map; commission an environmental report if risk is elevated.' },
      { title: 'Check mining and ground stability', description: 'Use the Coal Authority interactive map; consider a specialist report in former mining areas.' },
      { title: 'Review planning history and local constraints', description: 'Check the local council planning portal for past applications, permitted development restrictions, and Article 4 directions.' },
      { title: 'Analyse comparable sold prices', description: 'Review Land Registry sold data and local agent comparables to validate the asking price.' },
      { title: 'Model projected rental yield and ROI', description: 'Calculate gross yield, net yield, and SPV-level return on equity using realistic vacancy and cost assumptions.' },
      { title: 'Inspect property and assess condition', description: 'Note visible defects, damp, roof condition, and electrics; factor repair costs into your offer.' },
    ],
  },
];

export function buildTasksFromTemplate(templateId, propertyId = '') {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error('Template not found.');
  return template.tasks.map((def, index) => ({
    title: def.title,
    description: def.description || '',
    status: 'todo',
    scope: template.scope,
    propertyId: template.scope === 'property' ? String(propertyId) : '',
    templateId: template.id,
    templateOrder: index,
  }));
}
