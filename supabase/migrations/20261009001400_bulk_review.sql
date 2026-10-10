begin;
-- One atomic bounded batch. Existing item RPCs retain revision/audit authority.
create function public.bulk_review_items(family_input text,parent_input uuid,kind_input text,decision_input text,rationale_input text,items_input jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); w uuid; project uuid; source uuid; member_role text;
 entry jsonb; batch_item_id uuid; expected uuid; latest uuid; latest_decision text; total integer:=0;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if family_input is null or family_input not in ('QA','PLANNING') or decision_input is null or decision_input not in ('APPROVE','REJECT','EDIT')
 or (family_input='QA' and (kind_input is null or kind_input not in ('REQUIREMENT','RISK')))
 or (family_input='PLANNING' and (kind_input is null or kind_input not in ('SCENARIO','CASE')))
 or jsonb_typeof(items_input) is distinct from 'array' or jsonb_array_length(items_input) not between 1 and 50
 or octet_length(items_input::text)>1048576 or coalesce(length(rationale_input),0)>2000
 or (decision_input in ('REJECT','EDIT') and coalesce(length(btrim(rationale_input)),0)=0)
 then raise exception 'Invalid bounded bulk review' using errcode='23514'; end if;
 if family_input='QA' then
  select workspace_id,project_id,api_import_id into w,project,source from public.qa_analyses where id=parent_input;
 else
  select workspace_id,project_id,api_import_id into w,project,source from public.test_plans where id=parent_input;
 end if;
 if w is null then raise exception 'Review context unavailable' using errcode='42501'; end if;
 select role into member_role from public.workspace_members where workspace_id=w and user_id=caller for share;
 if not found or (decision_input in ('APPROVE','REJECT') and member_role not in ('OWNER','ADMIN'))
 then raise exception 'Review permission required' using errcode='42501'; end if;
 -- Fence current-source selection against concurrent imports (same project lock order).
 perform 1 from public.projects where id=project and workspace_id=w for update;
 if source is distinct from (select id from public.api_imports where project_id=project and workspace_id=w order by created_at desc,id desc limit 1)
 then raise exception 'Historical review context; use individual review' using errcode='40001'; end if;
 if (select count(distinct e->>'id') from jsonb_array_elements(items_input) e)<>jsonb_array_length(items_input)
 then raise exception 'Duplicate review selection' using errcode='23514'; end if;
 -- Sorted item locks prevent bulk/bulk lock-order inversions.
 for entry in select value from jsonb_array_elements(items_input) order by value->>'id' loop
  if jsonb_typeof(entry) is distinct from 'object' or not (entry ? 'expectedReviewId') or
     exists(select 1 from jsonb_object_keys(entry) k where k not in ('id','expectedReviewId','title','statement','objective','expectedBehavior'))
  then raise exception 'Invalid review selection' using errcode='23514'; end if;
  batch_item_id:=(entry->>'id')::uuid; expected:=nullif(entry->>'expectedReviewId','')::uuid;
  latest:=null; latest_decision:=null;
  if family_input='QA' then
   perform 1 from public.qa_items where id=batch_item_id and analysis_id=parent_input and workspace_id=w and project_id=project and kind=kind_input for update;
   if not found then raise exception 'Review item unavailable' using errcode='42501'; end if;
   select r.id,r.decision into latest,latest_decision from public.qa_reviews r where r.item_id=batch_item_id order by r.revision desc limit 1;
  else
   perform 1 from public.test_items where id=batch_item_id and plan_id=parent_input and workspace_id=w and kind=kind_input for update;
   if not found then raise exception 'Review item unavailable' using errcode='42501'; end if;
   -- Lock the pinned requirements, and reject plans whose review snapshots changed.
   perform 1 from public.qa_items q join public.test_requirement_versions v on v.requirement_id=q.id where v.plan_id=parent_input order by q.id for share of q;
   if (select count(*) from public.test_requirement_versions where plan_id=parent_input)<>(select count(*) from public.qa_items where analysis_id=(select qa_analysis_id from public.test_plans where id=parent_input) and kind='REQUIREMENT') or exists(select 1 from public.test_requirement_versions v where v.plan_id=parent_input and v.review_id is distinct from
     (select r.id from public.qa_reviews r where r.item_id=v.requirement_id order by r.revision desc limit 1))
   then raise exception 'Requirement snapshot changed; regenerate or use individual review' using errcode='40001'; end if;
   select r.id,r.decision into latest,latest_decision from public.test_reviews r where r.item_id=batch_item_id order by r.revision desc limit 1;
  end if;
  if latest is distinct from expected or coalesce(latest_decision,'EDIT')<>'EDIT'
  then raise exception 'Selection changed or already reviewed; reload' using errcode='40001'; end if;
  if family_input='QA' then
   perform public.review_qa_item(batch_item_id,expected,decision_input,rationale_input,
    case when decision_input='EDIT' then entry->>'title' end,
    case when decision_input='EDIT' then entry->>'statement' end);
  else
   perform public.review_test_item(batch_item_id,expected,decision_input,rationale_input,
    case when decision_input='EDIT' then entry->>'title' end,
    case when decision_input='EDIT' then entry->>'objective' end,
    case when decision_input='EDIT' then entry->>'expectedBehavior' end);
  end if;
  total:=total+1;
 end loop;
 return total;
end;$$;
revoke all on function public.bulk_review_items(text,uuid,text,text,text,jsonb) from public,anon,service_role,testpilot_runner;
grant execute on function public.bulk_review_items(text,uuid,text,text,text,jsonb) to authenticated;
select public.validate_execution_runner_role();
commit;
