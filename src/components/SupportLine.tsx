/**
 * A short, quiet line for anyone who finds tracking food or weight stressful. It sits at the
 * bottom of every tab, so it is always there without getting in the way. The number is ANAD's
 * free US eating disorder helpline (checked 2026-11-23 on anad.org); 988 is the US crisis line.
 */
export function SupportLine() {
  return (
    <p className="support-line" data-testid="support-line">
      If food or your weight is causing you stress, it is fine to stop tracking for a while. In the US you can talk to someone for free at the{' '}
      <a href="https://anad.org/eating-disorder-helpline/" target="_blank" rel="noreferrer">
        ANAD helpline
      </a>{' '}
      (<a href="tel:+18883757767">1-888-375-7767</a>), or call or text <a href="tel:988">988</a> in a crisis. Elsewhere, a doctor can point you to local help.
    </p>
  )
}
