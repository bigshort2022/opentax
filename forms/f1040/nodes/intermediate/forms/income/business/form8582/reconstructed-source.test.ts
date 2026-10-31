import { test, expect } from "bun:test";
import { form8582, inputSchema } from "./index.ts";

const activity = {activity_id:"durable-rental",name:"Renamed property",activity_type:"B",property_type:1,reporting_form:"schedule_e",current_net:-1000,prior_unallowed_operating:2000,prior_unallowed_4797_part1:3000,prior_unallowed_4797_part2:0,reconstructed_prior_loss_source:{tax_year:2021,activity_id:"durable-rental",provenance:"calculated-unfiled",evidence_reference:"synthetic reviewed 2021 reconstruction",operating:2000,form4797_part1:3000,form4797_part2:0}};
const facts = {activities:[activity],current_loss:1000,prior_unallowed:5000,has_other_passive:true};
test("unfiled rental PAL preserves operating and Part I reporting character",()=>{
  const result=form8582.compute({taxYear:2022,formType:"f1040"},inputSchema.parse(facts));
  expect(result.carryforwards?.["suspended_pal_8582:durable-rental"]).toBe(6000);
  expect(result.carryforwards?.["suspended_pal_8582_partix:durable-rental:schedule_e"]).toBe(3000);
  expect(result.carryforwards?.["suspended_pal_8582_partix:durable-rental:form4797_part1"]).toBe(3000);
});
test("reconstructed PAL cannot claim a different activity, year or amount",()=>{
  for(const change of [{tax_year:2020},{activity_id:"another-rental"},{operating:1999}]) {
    const input=inputSchema.parse({...facts,activities:[{...activity,reconstructed_prior_loss_source:{...activity.reconstructed_prior_loss_source,...change}}]});
    expect(()=>form8582.compute({taxYear:2022,formType:"f1040"},input)).toThrow();
  }
});

test("reconstructed active-rental prior character can use the special allowance without a sale",()=>{
  const input=inputSchema.parse({...facts,has_other_passive:false,has_active_rental:true,active_participation:true,modified_agi:0,rental_current_loss:1000,rental_prior_eligible_loss:5000,activities:[{...activity,activity_type:"A",prior_active_participation:true}]});
  const result=form8582.compute({taxYear:2022,formType:"f1040"},input);
  expect(result.carryforwards).toBeUndefined();
  expect(result.outputs.find(o=>o.nodeType==="schedule1")?.fields).toMatchObject({line5_schedule_e:-3000,line4_other_gains:-3000});
});
