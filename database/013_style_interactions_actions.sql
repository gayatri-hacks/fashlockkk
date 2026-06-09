alter table style_interactions
drop constraint if exists style_interactions_action_check;

alter table style_interactions
add constraint style_interactions_action_check
check (action in ('click', 'save', 'ignore', 'follow_up', 'message', 'shop_click'));
