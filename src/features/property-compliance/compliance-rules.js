/**
 * Pure priority engine for standard single-household English BTL tracking.
 * This does not determine legal compliance or calculate statutory deadlines.
 */
export const PROPERTY_REQUIREMENTS = Object.freeze([
  {id:'gas',name:'Gas safety certificate (CP12)',group:'safety',risk:100,condition:'gas'},
  {id:'eicr',name:'Electrical safety (EICR)',group:'safety',risk:95},
  {id:'alarms',name:'Smoke and carbon monoxide alarms',group:'safety',risk:95},
  {id:'epc',name:'Energy performance certificate (EPC)',group:'safety',risk:65},
  {id:'fire',name:'Fire and furnishings safety',group:'safety',risk:90},
  {id:'licensing',name:'Property licensing',group:'tenancy',risk:90},
  {id:'right-to-rent',name:'Right to Rent',group:'tenancy',risk:95},
  {id:'tenancy-terms',name:'Written tenancy terms',group:'tenancy',risk:80},
  {id:'how-to-rent',name:'How to Rent guide',group:'tenancy',risk:80},
  {id:'deposit',name:'Deposit protection',group:'tenancy',risk:98,condition:'deposit'},
  {id:'deposit-info',name:'Deposit prescribed information',group:'tenancy',risk:98,condition:'deposit'},
  {id:'hazards',name:'Property condition and hazards',group:'maintenance',risk:100},
  {id:'repairs',name:'Repairs and remedial works',group:'maintenance',risk:95},
  {id:'water',name:'Water safety / legionella risk',group:'maintenance',risk:75},
  {id:'inspections',name:'Routine property inspections',group:'maintenance',risk:45,advisory:true},
  {id:'inventory',name:'Inventory and check-in records',group:'maintenance',risk:45,advisory:true}
]);

function asDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value ? null : date;
}
export function daysUntil(date, today) {
  const end=asDay(date), start=asDay(today);
  return end && start ? Math.round((end-start)/86400000) : null;
}
export function assessRequirement(requirement, record={}, property={}, today) {
  if (!asDay(today)) throw new TypeError('Valid YYYY-MM-DD today required');
  const applicable = !((requirement.condition==='gas' && property.hasGas===false) ||
    (requirement.condition==='deposit' && property.hasDeposit===false));
  if (!applicable) return {...requirement,status:'not-applicable',priority:-1,daysRemaining:null,reason:'Not applicable based on recorded property information'};
  const daysRemaining=daysUntil(record.dueDate || record.expiryDate,today);
  let status,priority,reason;
  if(record.seriousHazard===true) {
    status='critical';priority=1200+requirement.risk;reason='Serious unresolved safety hazard';
  } else if(record.remedialActionOpen===true) {
    status='action-required';priority=950+requirement.risk;reason='Remedial action outstanding';
  } else if(daysRemaining!==null && daysRemaining<0) {
    status='overdue';priority=1000+requirement.risk+Math.min(-daysRemaining,30);reason='Recorded deadline has passed';
  } else if(record.confirmed!==true || record.applicability==='not-applicable' || (record.hasExpiry===true && daysRemaining===null)) {
    status='verification-required';priority=700+requirement.risk;reason='Missing or unverified evidence, applicability, or expiry';
  } else if(daysRemaining!==null && daysRemaining<=30) {
    status='due-soon';priority=500+requirement.risk-daysRemaining;reason='Recorded deadline approaching';
  } else {
    status='compliant';priority=10+requirement.risk/100-(daysRemaining===null?0:Math.min(daysRemaining,3650)/3650);reason='Recorded as verified; recheck if circumstances change';
  }
  return {...requirement,status,priority,daysRemaining,reason};
}
export function buildPropertyCompliance({records={},property={},today,group='overview'}={}) {
  if (!['overview','safety','tenancy','maintenance'].includes(group)) throw new TypeError('Unknown compliance group');
  const items=PROPERTY_REQUIREMENTS.filter(r=>group==='overview'||r.group===group)
    .map(r=>assessRequirement(r,records[r.id]||{},property,today))
    .sort((a,b)=>b.priority-a.priority||a.name.localeCompare(b.name));
  const count=(statuses)=>items.filter(r=>statuses.includes(r.status)).length;
  return {items,counts:{
    overdue:count(['critical','overdue']),
    actionRequired:count(['action-required','verification-required']),
    dueSoon:count(['due-soon']),
    compliant:count(['compliant']),
    notApplicable:count(['not-applicable'])
  }};
}
