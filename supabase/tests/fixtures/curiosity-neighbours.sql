-- Extend the disposable curiosity fixture with two declared graph neighbours.
-- Run in the same local fixture transaction as curiosity-source.sql.
reset role;
do $$ declare c public.test_items%rowtype;plan public.test_plans%rowtype;op text;node text;new_case uuid;provenance jsonb;definition jsonb;
begin
 select * into c from public.test_items where id=current_setting('exec.case')::uuid;
 select * into plan from public.test_plans where id=c.plan_id;
 select g.provenance into provenance from public.behaviour_graph_nodes g where graph_id=plan.behaviour_graph_id and logical_id='["OPERATION","GET /users"]';
 foreach op in array array['a','b'] loop
 node:='["OPERATION","GET /neighbour-'||op||'"]';
 update public.api_imports set knowledge=jsonb_set(knowledge,'{operations}',knowledge->'operations'||jsonb_build_array(jsonb_build_object('key','GET /neighbour-'||op,'method','get','path','/neighbour-'||op,'sourcePointer','#/info','parameters','[]'::jsonb,'responses',jsonb_build_array(jsonb_build_object('status','200','sourcePointer','#/info','content','{}'::jsonb)),'security','[]'::jsonb))) where id=plan.api_import_id;
 insert into public.behaviour_graph_nodes values(plan.behaviour_graph_id,plan.api_import_id,plan.project_id,plan.workspace_id,node,'OPERATION','Local declared neighbour '||op,provenance);
 insert into public.behaviour_graph_edges values(plan.behaviour_graph_id,plan.api_import_id,plan.project_id,plan.workspace_id,'local-neighbour-'||op,'OPERATION_PRECEDES_OPERATION','["OPERATION","GET /users"]',node,provenance);
 definition:=jsonb_set(jsonb_set(c.definition,'{logicalKey}',to_jsonb('CASE_NEIGHBOUR_'||op)),'{nodeRefs}',jsonb_build_array(node));
 insert into public.test_items(plan_id,qa_analysis_id,workspace_id,kind,logical_key,scenario_id,definition,origin,created_by) values(c.plan_id,c.qa_analysis_id,c.workspace_id,'CASE','CASE_NEIGHBOUR_'||op,c.scenario_id,definition,c.origin,c.created_by) returning id into new_case;
 insert into public.test_item_qa_links select new_case,plan_id,qa_analysis_id,workspace_id,qa_item_id,qa_kind from public.test_item_qa_links where item_id=c.id;
 insert into public.test_item_nodes values(new_case,c.plan_id,c.qa_analysis_id,c.workspace_id,plan.behaviour_graph_id,plan.api_import_id,plan.project_id,node);
 perform set_config('cu.neighbour_'||op,new_case::text,true);
 end loop;
end;$$;
set local role authenticated;
select public.review_test_item(current_setting('cu.neighbour_a')::uuid,null,'APPROVE','Local concurrency fixture.',null,null,null);
select public.review_test_item(current_setting('cu.neighbour_b')::uuid,null,'APPROVE','Local concurrency fixture.',null,null,null);
reset role;
