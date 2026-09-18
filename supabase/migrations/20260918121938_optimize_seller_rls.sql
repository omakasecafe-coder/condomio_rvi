-- Cache the authenticated user ID once per query in seller read policies.
alter policy seller_read_own_profile on public.seller_profiles
  using ((select auth.uid()) = auth_user_id);

alter policy seller_read_own_buildings on public.buildings
  using (
    exists (
      select 1 from public.seller_profiles p
      where p.id = seller_id
        and p.auth_user_id = (select auth.uid())
        and p.status = 'ACTIVE'
    )
  );

alter policy seller_read_own_opportunities on public.opportunities
  using (
    exists (
      select 1 from public.buildings b
      join public.seller_profiles p on p.id = b.seller_id
      where b.id = building_id
        and p.auth_user_id = (select auth.uid())
        and p.status = 'ACTIVE'
    )
  );
