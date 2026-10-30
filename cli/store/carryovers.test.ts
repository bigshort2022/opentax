import { test, expect } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendInput, createReturn, deleteInput, readReturnJson, updateInput } from "./store.ts";
import { previewCarryoverCommand, reviewCarryoverCommand, applyCarryoverCommand, reviewReturnSourcesCommand } from "../commands/carryover.ts";
import { carryoverInputIssues, carryoverIssues, returnSourceReviewIssues, LossProvenance } from "./carryovers.ts";

async function fixture(baseDir: string, year: number, ssn = "111223333", opening = false) {
  const { returnId } = await createReturn(year, baseDir);
  await appendInput(join(baseDir, returnId), "general", { filing_status: "single", taxpayer_first_name: "Synthetic", taxpayer_last_name: "Example", taxpayer_ssn: ssn });
  if (opening) await appendInput(join(baseDir, returnId), "schedule_d", { line_6_carryover: 10000, line_14_carryover: 0, opening_loss_source: { tax_year: year-1, evidence_reference: "synthetic opening workpaper", provenance: "reviewed-outside-evidence" } });
  return returnId;
}

test("read-only preview, reviewed unfiled 2021–25 chain, idempotence and stale grandparent", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "loss-continuity-"));
  try {
    const ids = [];
    for (let year=2021; year<=2025; year++) ids.push(await fixture(baseDir, year, undefined, year===2021));
    const bytes = (id: string) => readFile(join(baseDir,id,"return.json"), "utf8");
    for(let i=0; i<4; i++) {
      const args = { sourceReturnId: ids[i], targetReturnId: ids[i+1], baseDir };
      const beforeSource = await bytes(ids[i]); const beforeTarget = await bytes(ids[i+1]);
      const preview = await previewCarryoverCommand(args);
      expect(preview.capital?.shortTerm).toBe(10000);
      expect(await bytes(ids[i])).toBe(beforeSource); expect(await bytes(ids[i+1])).toBe(beforeTarget);
      await reviewCarryoverCommand({ ...args, evidenceReference: "synthetic completeness review", provenance: LossProvenance.CalculatedUnfiled, sourceComplete: true });
      const reviewed = await bytes(ids[i]);
      await applyCarryoverCommand(args);
      const applied = await bytes(ids[i+1]);
      await applyCarryoverCommand(args);
      expect(await bytes(ids[i+1])).toBe(applied); expect(await bytes(ids[i])).toBe(reviewed);
    }
    await updateInput(join(baseDir,ids[0]), "schedule_d_01", { line_6_carryover: 11000, line_14_carryover: 0, opening_loss_source: { tax_year: 2020, evidence_reference: "revised workpaper", provenance: "reviewed-outside-evidence" } });
    expect((await carryoverIssues(ids[4],baseDir)).some(x => x.code === "STALE_CARRYOVER")).toBe(true);
    const last = await bytes(ids[4]);
    await expect(applyCarryoverCommand({sourceReturnId:ids[3],targetReturnId:ids[4],baseDir})).rejects.toThrow();
    expect(await bytes(ids[4])).toBe(last);
    for(let i=0;i<4;i++) {
      const args={sourceReturnId:ids[i],targetReturnId:ids[i+1],baseDir};
      await reviewCarryoverCommand({...args,evidenceReference:"synthetic revised chain review",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
      await applyCarryoverCommand(args);
    }
    expect(await carryoverIssues(ids[4],baseDir)).toEqual([]);
    expect(JSON.parse(await bytes(ids[4])).inputs.schedule_d[0].fields.line_6_carryover).toBe(11000);
  } finally { await rm(baseDir, { recursive:true, force:true }); }
});

test("wrong taxpayer/year, independent target and unknown opening block without mutation", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "loss-conflict-"));
  try {
    const sourceReturnId = await fixture(baseDir,2021,undefined,true);
    await reviewReturnSourcesCommand({returnId:sourceReturnId,baseDir,evidenceReference:"synthetic complete opening review",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
    for (const [year,ssn,opening] of [[2023,"111223333",false],[2022,"999887777",false],[2022,"111223333",true]] as const) {
      const targetReturnId = await fixture(baseDir,year,ssn,opening);
      const args = {sourceReturnId,targetReturnId,baseDir};
      const path = join(baseDir,targetReturnId,"return.json"); const before = await readFile(path,"utf8");
      expect((await previewCarryoverCommand(args)).issues.some(i=>["NONCONSECUTIVE_YEARS","TAXPAYER_MISMATCH","TARGET_CARRYOVER_CONFLICT"].includes(i.code))).toBe(true);
      await expect(applyCarryoverCommand(args)).rejects.toThrow();
      expect(await readFile(path,"utf8")).toBe(before);
    }
    const unknown = await fixture(baseDir,2022);
    await appendInput(join(baseDir,unknown), "schedule_d", { line_1a_cost: 10000 });
    const target = await fixture(baseDir,2023);
    expect((await previewCarryoverCommand({sourceReturnId:unknown,targetReturnId:target,baseDir})).issues.some(x=>x.code==="UNKNOWN_OPENING_LOSS")).toBe(true);
  } finally { await rm(baseDir,{recursive:true,force:true}); }
});

test("two rental activities retain distinct suspended operating losses and unfiled provenance", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "rental-continuity-"));
  try {
    const sourceReturnId = await fixture(baseDir,2021);
    const targetReturnId = await fixture(baseDir,2022);
    const limitations = {basis_resolved:true,at_risk_resolved:true,qbi_transition_resolved:true,evidence_reference:"synthetic rental basis review"};
    for (const [activity_id,loss] of [["north",4000],["south",7000]] as const) {
      const row = {tsj:"T",activity_id,property_description:"Synthetic property",property_type:1,activity_type:"B",fair_rental_days:365,personal_use_days:0,rent_income:0,form_1099_payments_made:false,expense_repairs:loss,loss_limitations_review:limitations};
      await appendInput(join(baseDir,sourceReturnId),"schedule_e",{...row,prior_unallowed_passive_operating:0,prior_unallowed_passive_4797_part1:0,prior_unallowed_passive_4797_part2:0,reconstructed_prior_loss_source:{tax_year:2020,activity_id,operating:0,form4797_part1:0,form4797_part2:0,provenance:"reviewed-outside-evidence",evidence_reference:"synthetic opening zero"}});
      await appendInput(join(baseDir,targetReturnId),"schedule_e",{...row,expense_repairs:0});
    }
    const args = {sourceReturnId,targetReturnId,baseDir};
    const preview = await previewCarryoverCommand(args);
    expect(preview.issues).toEqual([]);
    expect(preview.rentals.map(r=>[r.activityId,r.operating])).toEqual([["north",4000],["south",7000]]);
    await reviewCarryoverCommand({...args,evidenceReference:"synthetic complete rental review",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
    await applyCarryoverCommand(args);
    const target = JSON.parse(await readFile(join(baseDir,targetReturnId,"return.json"),"utf8"));
    expect(target.inputs.schedule_e.map((r: {fields:Record<string,unknown>})=>r.fields.prior_unallowed_passive_operating)).toEqual([4000,7000]);
    expect(JSON.stringify(target)).not.toContain("filed_part_vii");
    expect(target.inputs.schedule_e[0].fields.reconstructed_prior_loss_source.provenance).toBe("calculated-unfiled");
    const source = JSON.parse(await readFile(join(baseDir,sourceReturnId,"return.json"),"utf8"));
    await updateInput(join(baseDir,sourceReturnId),source.inputs.schedule_e[0].id,{...source.inputs.schedule_e[0].fields,loss_limitations_review:undefined});
    expect((await previewCarryoverCommand(args)).issues.some(i=>i.code==="UNRESOLVED_LOSS_LIMITATION")).toBe(true);
  } finally {await rm(baseDir,{recursive:true,force:true});}
});

test("standalone source review is explicit and invalidated by financial edits", async () => {
  const baseDir = await mkdtemp(join(tmpdir(),"source-review-"));
  try {
    const returnId = await fixture(baseDir,2023);
    expect((await returnSourceReviewIssues(returnId,baseDir))[0]?.code).toBe("SOURCE_REVIEW_REQUIRED");
    await reviewReturnSourcesCommand({returnId,baseDir,evidenceReference:"synthetic reviewed zero-income inventory",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
    expect(await returnSourceReviewIssues(returnId,baseDir)).toEqual([]);
    await appendInput(join(baseDir,returnId),"schedule_d",{line_6_carryover:0,line_14_carryover:0});
    expect((await returnSourceReviewIssues(returnId,baseDir))[0]?.code).toBe("STALE_SOURCE_REVIEW");
  } finally {await rm(baseDir,{recursive:true,force:true});}
});

test("composite-start carryovers preserve sibling facts and follow rental IDs through reordering",async()=>{
  const baseDir=await mkdtemp(join(tmpdir(),"nested-carryover-"));
  try {
    const sourceReturnId=await fixture(baseDir,2021,undefined,true);
    const {returnId:targetReturnId}=await createReturn(2022,baseDir);
    const limitations={basis_resolved:true,at_risk_resolved:true,qbi_transition_resolved:true,evidence_reference:"synthetic basis/at-risk review"};
    const rentals=["north","south"].map((activity_id,index)=>({tsj:"T",activity_id,property_description:`Synthetic ${activity_id}`,property_type:1,activity_type:"B",fair_rental_days:365,personal_use_days:0,rent_income:0,form_1099_payments_made:false,expense_repairs:(index+1)*1000,loss_limitations_review:limitations}));
    for(const row of rentals) await appendInput(join(baseDir,sourceReturnId),"schedule_e",{...row,prior_unallowed_passive_operating:0,prior_unallowed_passive_4797_part1:0,prior_unallowed_passive_4797_part2:0,reconstructed_prior_loss_source:{tax_year:2020,activity_id:row.activity_id,provenance:LossProvenance.ReviewedOutsideEvidence,evidence_reference:"reviewed zero history",operating:0,form4797_part1:0,form4797_part2:0}});
    const general={filing_status:"single",taxpayer_ssn:"111223333",taxpayer_first_name:"Synthetic",taxpayer_last_name:"Example"};
    const {id}=await appendInput(join(baseDir,targetReturnId),"start",{general,schedule_d:{line_1a_proceeds:200,line_1a_cost:100},schedule_e:rentals.map(row=>({...row,expense_repairs:0}))});
    const args={sourceReturnId,targetReturnId,baseDir};
    await reviewCarryoverCommand({...args,evidenceReference:"reviewed nested transfer",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
    await applyCarryoverCommand(args);
    const path=join(baseDir,targetReturnId,"return.json");
    const saved=JSON.parse(await readFile(path,"utf8"));
    expect(saved.inputs.schedule_d).toBeUndefined();
    const fields=saved.inputs.start[0].fields;
    expect(fields.general).toEqual(general);
    expect(fields.schedule_d).toMatchObject({line_1a_proceeds:200,line_1a_cost:100,line_6_carryover:10000,line_14_carryover:0});
    expect(fields.schedule_e.map((row:{prior_unallowed_passive_operating:number})=>row.prior_unallowed_passive_operating)).toEqual([1000,2000]);
    await updateInput(join(baseDir,targetReturnId),id,{...fields,general:{...general,taxpayer_first_name:"Updated synthetic name"},schedule_e:[...fields.schedule_e].reverse()});
    expect(await carryoverIssues(targetReturnId,baseDir)).toEqual([]);
    const reordered=await readFile(path,"utf8");
    expect((await applyCarryoverCommand(args)).idempotent).toBe(true);
    expect(await readFile(path,"utf8")).toBe(reordered);
    const reorderedFields=JSON.parse(reordered).inputs.start[0].fields;
    await updateInput(join(baseDir,targetReturnId),id,{...reorderedFields,schedule_d:{...reorderedFields.schedule_d,line_6_carryover:999}});
    const conflicting=await readFile(path,"utf8");
    await expect(applyCarryoverCommand(args)).rejects.toThrow("cannot be overwritten");
    expect(await readFile(path,"utf8")).toBe(conflicting);
  } finally {await rm(baseDir,{recursive:true,force:true});}
});

function rentalFields(activity_id = "north") {
  return {
    tsj:"T",activity_id,property_description:"Synthetic property",property_type:1,
    activity_type:"B",fair_rental_days:365,personal_use_days:0,rent_income:0,
    form_1099_payments_made:false,
    loss_limitations_review:{basis_resolved:true,at_risk_resolved:true,qbi_transition_resolved:true,evidence_reference:"synthetic limitation review"},
  };
}

function rentalOpening(year:number, operating=0, activity_id="north") {
  return {
    prior_unallowed_passive_operating:operating,prior_unallowed_passive_4797_part1:0,prior_unallowed_passive_4797_part2:0,
    reconstructed_prior_loss_source:{tax_year:year-1,activity_id,operating,form4797_part1:0,form4797_part2:0,provenance:LossProvenance.ReviewedOutsideEvidence,evidence_reference:"synthetic opening history"},
  };
}

test("removed reviewed source balance blocks reapplication without orphaning installed fields",async()=>{
  const baseDir=await mkdtemp(join(tmpdir(),"removed-carryover-"));
  try {
    const sourceReturnId=await fixture(baseDir,2021,undefined,true);
    const targetReturnId=await fixture(baseDir,2022);
    const args={sourceReturnId,targetReturnId,baseDir};
    await reviewCarryoverCommand({...args,evidenceReference:"synthetic initial review",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
    await applyCarryoverCommand(args);
    const path=join(baseDir,targetReturnId,"return.json");
    const installed=await readFile(path,"utf8");
    await deleteInput(join(baseDir,sourceReturnId),"schedule_d_01");
    await reviewReturnSourcesCommand({returnId:sourceReturnId,baseDir,evidenceReference:"synthetic corrected source inventory",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
    const source=await readFile(join(baseDir,sourceReturnId,"return.json"),"utf8");
    expect((await previewCarryoverCommand(args)).issues.some(i=>i.code==="TARGET_CARRYOVER_DISAPPEARED")).toBe(true);
    await expect(applyCarryoverCommand(args)).rejects.toThrow("TARGET_CARRYOVER_DISAPPEARED");
    expect(await readFile(path,"utf8")).toBe(installed);
    expect(await readFile(join(baseDir,sourceReturnId,"return.json"),"utf8")).toBe(source);
    expect((await carryoverIssues(targetReturnId,baseDir)).some(i=>i.code==="STALE_CARRYOVER")).toBe(true);
  } finally {await rm(baseDir,{recursive:true,force:true});}
});

test("MFJ role swaps preserve actual rental owners and reject switches in preview and apply",async()=>{
  const baseDir=await mkdtemp(join(tmpdir(),"rental-owner-"));
  try {
    const sourceReturnId=await fixture(baseDir,2021);
    const targetReturnId=await fixture(baseDir,2022);
    const general={filing_status:"mfj",taxpayer_first_name:"Synthetic",taxpayer_last_name:"Example",spouse_first_name:"Other",spouse_last_name:"Example"};
    await updateInput(join(baseDir,sourceReturnId),"general_01",{...general,taxpayer_ssn:"111223333",spouse_ssn:"999887777"});
    await updateInput(join(baseDir,targetReturnId),"general_01",{...general,taxpayer_ssn:"999887777",spouse_ssn:"111223333"});
    for(const [activity_id,sourceOwner,targetOwner] of [["north","T","S"],["south","S","T"],["joint","J","J"]] as const) {
      await appendInput(join(baseDir,sourceReturnId),"schedule_e",{...rentalFields(activity_id),...rentalOpening(2021,0,activity_id),tsj:sourceOwner,expense_repairs:1000});
      await appendInput(join(baseDir,targetReturnId),"schedule_e",{...rentalFields(activity_id),tsj:targetOwner});
    }
    const args={sourceReturnId,targetReturnId,baseDir};
    expect((await previewCarryoverCommand(args)).issues).toEqual([]);
    await reviewCarryoverCommand({...args,evidenceReference:"synthetic owner review",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
    await applyCarryoverCommand(args);
    const targetPath=join(baseDir,targetReturnId);
    const target=await readReturnJson(targetPath);
    expect(target.inputs.schedule_e.map(row=>row.fields.prior_unallowed_passive_operating)).toEqual([1000,1000,1000]);
    expect((await applyCarryoverCommand(args)).idempotent).toBe(true);
    const row=target.inputs.schedule_e[0];
    await updateInput(targetPath,row.id,{...row.fields,tsj:"T"});
    const switched=await readFile(join(targetPath,"return.json"),"utf8");
    expect((await carryoverIssues(targetReturnId,baseDir)).some(i=>i.code==="STALE_CARRYOVER")).toBe(true);
    await expect(reviewReturnSourcesCommand({returnId:targetReturnId,baseDir,evidenceReference:"synthetic attempted owner review",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true})).rejects.toThrow("STALE_CARRYOVER");
    expect((await previewCarryoverCommand(args)).issues.some(i=>i.code==="TARGET_ACTIVITY_MISMATCH")).toBe(true);
    await expect(applyCarryoverCommand(args)).rejects.toThrow("ownership differs");
    expect(await readFile(join(targetPath,"return.json"),"utf8")).toBe(switched);
    await updateInput(targetPath,row.id,{...row.fields,ownership_percent:50});
    expect((await carryoverIssues(targetReturnId,baseDir)).some(i=>i.code==="STALE_CARRYOVER")).toBe(true);
    await updateInput(targetPath,row.id,row.fields);
    expect(await carryoverIssues(targetReturnId,baseDir)).toEqual([]);
  } finally {await rm(baseDir,{recursive:true,force:true});}
});

test("profitable allocated rental with zero opening PAL permits an unrelated capital transfer",async()=>{
  const baseDir=await mkdtemp(join(tmpdir(),"profitable-carryover-"));
  try {
    const sourceReturnId=await fixture(baseDir,2021,undefined,true);
    const targetReturnId=await fixture(baseDir,2022);
    await appendInput(join(baseDir,sourceReturnId),"schedule_e",{
      ...rentalFields(),...rentalOpening(2021),rent_income:5000,
      expense_allocation_source:{
        tax_year:2021,activity_id:"north",source_reference:"synthetic expense ledger",
        use_pattern:"rental-only",rental_period:{from:"2021-01-01",through:"2021-12-31"},
        no_personal_use_during_rental_period:true,amounts_before_ownership_allocation:true,
        expenses:[{expense_id:"repairs",category:"expense_repairs",transaction_kind:"expense",source_amount:1000,source_reference:"synthetic invoice",paid_on:"2021-06-01",expense_period:{from:"2021-06-01",through:"2021-06-01"},method:"direct-rental",method_reference:"rental repair invoice"}],
      },
    });
    await appendInput(join(baseDir,targetReturnId),"schedule_e",rentalFields());
    const args={sourceReturnId,targetReturnId,baseDir};
    const preview=await previewCarryoverCommand(args);
    expect(preview.issues).toEqual([]);
    expect(preview.rentals).toMatchObject([{activityId:"north",incoming:0,currentLoss:0,outgoing:0}]);
    expect(preview.capital?.shortTerm).toBe(10000);
    await reviewCarryoverCommand({...args,evidenceReference:"synthetic profitable rental review",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
    const reviewed=await readFile(join(baseDir,sourceReturnId,"return.json"),"utf8");
    await applyCarryoverCommand(args);
    const target=await readReturnJson(join(baseDir,targetReturnId));
    expect(target.inputs.schedule_d[0].fields.line_6_carryover).toBe(10000);
    expect(target.inputs.schedule_e[0].fields.prior_unallowed_passive_operating).toBe(0);
    expect(await readFile(join(baseDir,sourceReturnId,"return.json"),"utf8")).toBe(reviewed);
  } finally {await rm(baseDir,{recursive:true,force:true});}
});

test("inactive type B year preserves prior active loss history for resumed participation",async()=>{
  const baseDir=await mkdtemp(join(tmpdir(),"prior-active-carryover-"));
  try {
    const sourceReturnId=await fixture(baseDir,2022);
    const targetReturnId=await fixture(baseDir,2023);
    await appendInput(join(baseDir,sourceReturnId),"schedule_e",{...rentalFields(),...rentalOpening(2022,10000),prior_passive_losses_active_when_incurred:true});
    await appendInput(join(baseDir,targetReturnId),"schedule_e",{...rentalFields(),activity_type:"A"});
    const args={sourceReturnId,targetReturnId,baseDir};
    const preview=await previewCarryoverCommand(args);
    expect(preview.issues).toEqual([]);
    expect(preview.rentals).toMatchObject([{operating:10000,currentLoss:0,activeWhenIncurred:true}]);
    await reviewCarryoverCommand({...args,evidenceReference:"synthetic unchanged prior loss review",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true});
    await applyCarryoverCommand(args);
    const target=await readReturnJson(join(baseDir,targetReturnId));
    expect(target.inputs.schedule_e[0].fields.prior_passive_losses_active_when_incurred).toBe(true);
    const following=await fixture(baseDir,2024);
    await appendInput(join(baseDir,following),"schedule_e",{...rentalFields(),activity_type:"A"});
    const resumed=await previewCarryoverCommand({sourceReturnId:targetReturnId,targetReturnId:following,baseDir});
    expect(resumed.issues).toEqual([]);
    expect(resumed.rentals).toMatchObject([{incoming:10000,allowed:10000,outgoing:0}]);
  } finally {await rm(baseDir,{recursive:true,force:true});}
});

test("mixed participation histories are not certified as a single outgoing loss attribute",async()=>{
  const baseDir=await mkdtemp(join(tmpdir(),"mixed-active-carryover-"));
  try {
    const sourceReturnId=await fixture(baseDir,2022);
    const targetReturnId=await fixture(baseDir,2023);
    await appendInput(join(baseDir,sourceReturnId),"schedule_e",{...rentalFields(),...rentalOpening(2022,10000),expense_repairs:1000,prior_passive_losses_active_when_incurred:true});
    await appendInput(join(baseDir,targetReturnId),"schedule_e",rentalFields());
    const args={sourceReturnId,targetReturnId,baseDir};
    expect((await previewCarryoverCommand(args)).issues.some(i=>i.code==="INCOMPLETE_SOURCE" && i.message.includes("participation histories"))).toBe(true);
    await expect(reviewCarryoverCommand({...args,evidenceReference:"synthetic mixed history",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true})).rejects.toThrow("participation histories");
  } finally {await rm(baseDir,{recursive:true,force:true});}
});

test("first year zero history requires matching activity and acquisition year",async()=>{
  const baseDir=await mkdtemp(join(tmpdir(),"first-year-carryover-"));
  try {
    const sourceReturnId=await fixture(baseDir,2022);
    const targetReturnId=await fixture(baseDir,2023);
    const firstYear={activity_id:"north",activity_name:"Synthetic property",activity_acquired_on:"2022-01-01",acquisition_document_reference:"synthetic deed",not_grouped_with_prior_activity:true};
    expect(carryoverInputIssues({schedule_e:[{...rentalFields(),first_year_activity_source:firstYear}]},2022)).toEqual([]);
    for(const source of [{...firstYear,activity_id:"south"},{...firstYear,activity_acquired_on:"2021-01-01"}]) {
      expect(carryoverInputIssues({schedule_e:[{...rentalFields(),first_year_activity_source:source}]},2022).some(i=>i.code==="RENTAL_OPENING_MISMATCH")).toBe(true);
    }
    await appendInput(join(baseDir,sourceReturnId),"schedule_e",{...rentalFields(),expense_repairs:1000,first_year_activity_source:{...firstYear,activity_id:"south"}});
    await appendInput(join(baseDir,targetReturnId),"schedule_e",rentalFields());
    const args={sourceReturnId,targetReturnId,baseDir};
    expect((await previewCarryoverCommand(args)).issues.some(i=>i.code==="RENTAL_OPENING_MISMATCH")).toBe(true);
    await expect(reviewCarryoverCommand({...args,evidenceReference:"synthetic wrong activity deed",provenance:LossProvenance.CalculatedUnfiled,sourceComplete:true})).rejects.toThrow("RENTAL_OPENING_MISMATCH");
    const before=await readFile(join(baseDir,targetReturnId,"return.json"),"utf8");
    await expect(applyCarryoverCommand(args)).rejects.toThrow("RENTAL_OPENING_MISMATCH");
    expect(await readFile(join(baseDir,targetReturnId,"return.json"),"utf8")).toBe(before);
  } finally {await rm(baseDir,{recursive:true,force:true});}
});

test("nonjoint spouse and joint-owner rentals cannot transfer losses",async()=>{
  const baseDir=await mkdtemp(join(tmpdir(),"nonjoint-rental-owner-"));
  try {
    for(const filing_status of ["single","mfs"]) for(const tsj of ["S","J"]) {
      const sourceReturnId=await fixture(baseDir,2021);
      const targetReturnId=await fixture(baseDir,2022);
      for(const id of [sourceReturnId,targetReturnId]) await updateInput(join(baseDir,id),"general_01",{
        filing_status,taxpayer_first_name:"Synthetic",taxpayer_last_name:"Example",taxpayer_ssn:"111223333",
        spouse_first_name:"Other",spouse_last_name:"Example",spouse_ssn:"999887777",
      });
      await appendInput(join(baseDir,sourceReturnId),"schedule_e",{...rentalFields(),...rentalOpening(2021),tsj,expense_repairs:1000});
      await appendInput(join(baseDir,targetReturnId),"schedule_e",{...rentalFields(),tsj});
      const args={sourceReturnId,targetReturnId,baseDir};
      expect((await previewCarryoverCommand(args)).issues.some(i=>i.code==="TARGET_ACTIVITY_MISMATCH")).toBe(true);
      const path=join(baseDir,targetReturnId,"return.json");
      const before=await readFile(path,"utf8");
      await expect(applyCarryoverCommand(args)).rejects.toThrow("ownership differs");
      expect(await readFile(path,"utf8")).toBe(before);
    }
  } finally {await rm(baseDir,{recursive:true,force:true});}
});
