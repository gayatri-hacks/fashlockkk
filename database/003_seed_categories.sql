insert into categories (name) values
  ('Women Tops'),
  ('Women Bottomwear'),
  ('Men Shirts'),
  ('Dresses'),
  ('Outerwear'),
  ('Accessories')
on conflict (name) do nothing;
 
