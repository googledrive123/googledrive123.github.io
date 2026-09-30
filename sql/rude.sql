-- Rude words.
--
-- One check for text that other players will see: chat messages now, and
-- usernames next. True when the text holds a slur, a sexual word or a strong
-- swear, false for everything else.
--
-- The hard part is leaving alone the ordinary words that happen to contain a
-- bad one: class, assassin, Scunthorpe, cockpit, therapist. So a listed word
-- only counts when it stands on its own, and only the few that no ordinary
-- word contains are matched anywhere, which is what catches them joined onto
-- something else (fuckoff, ubitch).
--
-- Apply against project dxwjxzmlezfyursysays. Every statement is safe to run
-- twice. Applied on 30 September 2026.


create or replace function public.gv_is_rude(p_text text)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  -- Whole words only. A bracketed group is an optional ending or start.
  --
  -- Repeats are collapsed on the list's side: every letter below matches a
  -- run of itself, so fuuuck and a$$$ are caught, while as, bob and Niger,
  -- which only lack a doubled letter, stay allowed. That is also why raped
  -- is missing (it would catch rapped) and ass takes no -es (assess).
  v_words text[] := array[
    'fuk(s|er|ers|ing|in|ed)?', 'fck(s|er|ers|ing|in|ed)?', 'fk(ing|in|n)?',
    'stfu', 'gtfo',
    '(bull|horse|dip|ape|dog|chicken)?shit(s|y|er|ers|ing|ed|head|heads|hole|face|bag|show|post)?',
    'cunt(s|y)?', 'bastard(s)?', 'twat(s)?', 'wank(s|er|ers|ing)?',
    '(dumb|jack|smart|fat|lard|kiss)?ass(hole|holes|hat|hats|wipe|face|head|kisser)?',
    'arse(s|hole|holes)?', 'dick(s|head|heads|face|hole|wad)?',
    'cock(s|sucker|suckers)?', 'bollocks', 'bellend(s)?', 'piss(ed|es|ing)?',
    'jizz', 'cum', 'cumshot(s)?',
    'sex(y|t|ts|ting|ual)?', 'penis(es)?', 'vagina(s)?', 'boob(s|ies)?',
    'tits', 'titty', 'titties', 'puss(y|ies)', 'horny', 'nude(s)?',
    'orgasm(s)?', 'masturbat(e|es|ed|ing|ion)', 'jerk ?off', 'jack ?off',
    'anal', 'anus', 'rape(s)?', 'rapist(s)?', 'molest(er|ers|ed|ing)?',
    'pedo(s|phile|philes)?', 'paedo(s|phile|philes)?', 'milf(s)?', 'hentai',
    'bdsm', 'clit(s|oris)?', 'thot(s)?',
    'kys', 'kil ?(yo)?ur ?self',
    'nigger(s)?', 'fag(s)?', 'dyke(s)?', 'tranny', 'trannies',
    'retard(s|ed)?', 'spic(s)?', 'chink(s)?', 'gook(s)?', 'kike(s)?',
    'wetback(s)?', 'beaner(s)?', 'raghead(s)?', 'towelhead(s)?', 'coon(s)?',
    'paki(s)?', 'shemale(s)?'
  ];
  -- Matched anywhere, even inside a longer word. Only words that no
  -- ordinary word contains belong here.
  v_inside text[] := array[
    'fuck', 'bitch', 'nigga', 'faggot', 'whore', 'slut', 'porn', 'dildo',
    'blowjob', 'handjob', 'asshole', 'cocksucker'
  ];
  v_text text := lower(coalesce(p_text, ''));
begin
  v_text := translate(v_text, '013457@$', 'oieastas');
  v_text := regexp_replace(v_text, '[^a-z]+', ' ', 'g');

  return v_text ~ ('\m(' || array_to_string(array(
           select regexp_replace(w, '([a-z])', '\1+', 'g') from unnest(v_words) w
         ), '|') || ')\M')
      or v_text ~ ('(' || array_to_string(array(
           select regexp_replace(w, '([a-z])', '\1+', 'g') from unnest(v_inside) w
         ), '|') || ')');
end;
$function$;
