"use client";

/**
 * The builder's five steps: Business, Home Office, Vehicle, Timing, Review &
 * Sign. Every label, hint, placeholder and recommendation sentence is the
 * original's wording — staff and clients have read these, and the policy
 * document is written against them — so edit copy here deliberately.
 *
 * The copy speaks to staff about "the client": staff run this on a call and
 * the client watches.
 *
 * State lives in the builder; each step gets the plan, the derived totals, an
 * `err(key)` that returns a field's error once it should show, and `update`.
 * Editing anything about a vehicle drops its method override, as the
 * original did — an override is a choice between two numbers, and changing
 * the inputs changes the numbers.
 */

import { Fragment } from "react";
import { SelectInput, Slider } from "@/components/portal/widgets/ui";
import {
  catchUpNoteForEstimate,
  formatEin,
  getSubstantiationGroups,
  homeOfficeDocItems,
  homeOfficeEscrowNote,
  MAX_VEHICLES,
  money,
  newVehicle,
  nextVehicleSeq,
  reimbursementCadenceNote,
  vehicleBundlingNote,
  vehicleDocItems,
  type HomeOffice,
  type HomeOfficeCalc,
  type PlanState,
  type PlanTotals,
  type Vehicle,
  type VehicleCalc,
  type VehiclesSection,
  type WeightClass,
} from "@/lib/tax-strategy/accountable-plan";
import { greatVibes } from "./font";
import {
  ChoiceCard,
  ChoiceRow,
  DateField,
  FormField,
  GroupError,
  Hint,
  InfoCallout,
  MoneyField,
  NumberInput,
  Prompt,
  SectionLabel,
  StepHeader,
  TextInput,
  ToggleRow,
  btnCls,
} from "./kit";

export type StepProps = {
  plan: PlanState;
  all: PlanTotals;
  /** A field's error, once it should show (after a Continue attempt, or once the field is edited). */
  err: (key: string) => string | undefined;
  /** Mark a field as edited, so its error shows live from here on. */
  touch: (key: string) => void;
  update: (fn: (p: PlanState) => PlanState) => void;
};

type Update = StepProps["update"];

const patchHo = (update: Update, patch: Partial<HomeOffice>) =>
  update((p) => ({ ...p, homeOffice: { ...p.homeOffice, ...patch } }));

const patchVehicles = (update: Update, patch: Partial<VehiclesSection>) =>
  update((p) => ({ ...p, vehicles: { ...p.vehicles, ...patch } }));

const patchVehicle = (update: Update, id: string, patch: Partial<Vehicle>) =>
  update((p) => ({
    ...p,
    vehicles: {
      ...p.vehicles,
      list: p.vehicles.list.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    },
  }));

const PLANNING_NOTE =
  "* These are planning estimates — going forward, the client will calculate each period’s reimbursement using the plan’s reimbursement tracker.";

const MAINTENANCE_HINT =
  "Routine upkeep that recurs every month, e.g., lawn care, pest control, pool service, HVAC service plan, regular cleaning.";

const REPAIRS_HINT =
  "One-off fixes over the year, e.g., roof patch, plumbing repair, appliance repair, water heater, repainting.";

const pair = "grid gap-x-3.5 sm:grid-cols-2";

/* ───────────────────────────── shared blocks ───────────────────────────── */

/** The pink "Recommended" box, in magenta. */
function RecommendBanner({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 mt-1 rounded-[16px] border border-magenta/40 bg-magenta/[0.08] px-[18px] py-4">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2.5">
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-magenta">{label}</span>
        <span className="font-display text-[22px] font-bold text-fog">{title}</span>
      </div>
      {children}
    </div>
  );
}

const why = "text-[12.5px] leading-relaxed text-mist";
const smallNote = "mt-1.5 text-[11.5px] leading-relaxed text-mist opacity-80";

/** One-time catch-up question, shared by the Home Office and Vehicle steps. */
function CatchUpBlock({
  group,
  sec,
  err,
  touch,
  onChoose,
  onDate,
}: {
  group: "ho" | "v";
  sec: { catchUp: boolean | null; catchUpDate: string };
  err: StepProps["err"];
  touch: StepProps["touch"];
  onChoose: (yes: boolean) => void;
  onDate: (iso: string) => void;
}) {
  const errKey = group === "ho" ? "hoCatchUp" : "vCatchUp";
  const dateKey = group === "ho" ? "hoCatchUpDate" : "vCatchUpDate";
  return (
    <>
      <SectionLabel>One-time catch-up reimbursement</SectionLabel>
      <Prompt>
        Will the client take a one-time catch-up reimbursement for expenses earlier this year that went
        unreimbursed because they weren&rsquo;t yet aware of this S-Corp shareholder benefit?
      </Prompt>
      <ChoiceRow label="One-time catch-up reimbursement">
        <ChoiceCard selected={sec.catchUp === true} onSelect={() => onChoose(true)}>
          Yes, one-time catch-up
        </ChoiceCard>
        <ChoiceCard selected={sec.catchUp === false} onSelect={() => onChoose(false)}>
          No catch-up
        </ChoiceCard>
      </ChoiceRow>
      <GroupError>{err(errKey)}</GroupError>
      <Hint className="-mt-1.5 mb-4">
        A one-time payment for expenses earlier this year that went unreimbursed because the client
        wasn&rsquo;t yet aware of this benefit. After the catch-up date, reimbursements follow the
        plan&rsquo;s regular timing rules.
      </Hint>
      {sec.catchUp !== null ? (
        <DateField
          id={`ap-${dateKey}`}
          label={sec.catchUp ? "Catch-up through" : "Reimbursements begin after"}
          value={sec.catchUpDate}
          error={err(dateKey)}
          onChange={(iso) => {
            onDate(iso);
            touch(dateKey);
          }}
          hint={
            sec.catchUp
              ? "Expenses through this date are covered by the catch-up. Defaults to the end of this month."
              : "Expenses on or before this date won’t be reimbursed, so the annual estimate starts the day after. Defaults to the end of this month."
          }
        />
      ) : null}
    </>
  );
}

/* ───────────────────────────── 1 · Business ───────────────────────────── */

export function BusinessStep({ plan, err, touch, update }: StepProps) {
  const text =
    (key: "businessName" | "entityState" | "ownerName" | "preparedBy") => (v: string) => {
      update((p) => ({ ...p, [key]: v }));
      touch(key);
    };
  return (
    <>
      <StepHeader step={1} title="Tell us about the business">
        This appears on the cover of the client&rsquo;s written Accountable Plan policy.
      </StepHeader>

      <FormField label="Business (S-Corporation) name" htmlFor="ap-businessName" error={err("businessName")}>
        <TextInput
          id="ap-businessName"
          value={plan.businessName}
          onChange={text("businessName")}
          placeholder="e.g., Riverside Design Studio, Inc."
          invalid={!!err("businessName")}
        />
      </FormField>

      <div className={pair}>
        <FormField label="State of formation (optional)" htmlFor="ap-entityState">
          <TextInput
            id="ap-entityState"
            value={plan.entityState}
            onChange={text("entityState")}
            placeholder="e.g., Virginia"
          />
        </FormField>
        <FormField label="EIN (optional)" htmlFor="ap-ein" error={err("ein")}>
          <TextInput
            id="ap-ein"
            value={plan.ein}
            inputMode="numeric"
            maxLength={10}
            placeholder="XX-XXXXXXX"
            invalid={!!err("ein")}
            onChange={(v) => {
              update((p) => ({ ...p, ein: formatEin(v) }));
              touch("ein");
            }}
          />
        </FormField>
      </div>

      <FormField
        label="Shareholder-employee name"
        htmlFor="ap-ownerName"
        hint="The owner who will be reimbursed under this plan."
        error={err("ownerName")}
      >
        <TextInput
          id="ap-ownerName"
          value={plan.ownerName}
          onChange={text("ownerName")}
          placeholder="e.g., Jordan Lee"
          invalid={!!err("ownerName")}
        />
      </FormField>

      <div className={pair}>
        <DateField
          id="ap-effectiveDate"
          label="Plan effective date"
          value={plan.effectiveDate}
          error={err("effectiveDate")}
          onChange={(iso) => {
            update((p) => ({ ...p, effectiveDate: iso }));
            touch("effectiveDate");
          }}
        />
        <FormField label="Prepared with (optional)" htmlFor="ap-preparedBy">
          <TextInput
            id="ap-preparedBy"
            value={plan.preparedBy}
            onChange={text("preparedBy")}
            placeholder="e.g., accounting firm name"
          />
        </FormField>
      </div>
    </>
  );
}

/* ───────────────────────────── 2 · Home office ───────────────────────────── */

function HomeOfficeRecommendation({ ho, calc }: { ho: HomeOffice; calc: HomeOfficeCalc }) {
  if (ho.hasDedicated === null) {
    return (
      <InfoCallout tone="amber" title="Not enough to work with yet">
        Answer the question above to see a recommendation.
      </InfoCallout>
    );
  }
  if (ho.hasDedicated === false) {
    return (
      <InfoCallout tone="amber" title="No dedicated space">
        Home office reimbursement is only well supported for a space used regularly and exclusively
        for business. Without one, this section isn&rsquo;t recommended &mdash; turn it off above.
      </InfoCallout>
    );
  }
  const cuNote = catchUpNoteForEstimate(ho);
  const docs = homeOfficeDocItems(ho);
  const escrow = homeOfficeEscrowNote(ho);
  return (
    <RecommendBanner label="Recommended" title="Actual Expense Method">
      <p className={why}>
        A regularly and exclusively used office supports the Actual Expense Method. Estimated annual
        benefit: {money(calc.actualDeduction)}.{cuNote ? " " + cuNote : ""}
      </p>
      {docs.length ? (
        <p className={`${why} mt-2`}>
          <strong className="font-semibold text-fog">Client will need to provide:</strong> {docs.join(", ")}
        </p>
      ) : null}
      {escrow ? <p className={smallNote}>{escrow}</p> : null}
    </RecommendBanner>
  );
}

export function HomeOfficeStep({ plan, all, err, touch, update }: StepProps) {
  const ho = plan.homeOffice;
  const calc = all.ho;
  const set = (patch: Partial<HomeOffice>) => patchHo(update, patch);
  const cost = (
    key: "mortgageInterest" | "propertyTax" | "rentPaid" | "homeInsurance" | "utilities" | "maintenance" | "repairs",
    label: string,
    placeholder: string,
    hint?: string,
  ) => (
    <MoneyField
      id={`ap-${key}`}
      label={label}
      value={ho[key]}
      placeholder={placeholder}
      hint={hint}
      onChange={(raw) => set({ [key]: raw })}
    />
  );

  return (
    <>
      <StepHeader step={2} title="Home office reimbursement">
        One question decides whether the client qualifies for home office reimbursement under the
        Actual Expense Method.
      </StepHeader>

      <ToggleRow
        title="Include home office reimbursement"
        desc="Turn this on if the client uses their home for business at all."
        checked={ho.included}
        onChange={(v) => set({ included: v })}
      />

      {ho.included ? (
        <>
          <SectionLabel>Regular workspace</SectionLabel>
          <Prompt>
            Does the client use a specific area of their home regularly and exclusively for company
            work &mdash; a dedicated desk or room, not shared with personal use?
          </Prompt>
          <ChoiceRow label="Dedicated workspace">
            <ChoiceCard selected={ho.hasDedicated === true} onSelect={() => set({ hasDedicated: true })}>
              Yes, dedicated space
            </ChoiceCard>
            <ChoiceCard selected={ho.hasDedicated === false} onSelect={() => set({ hasDedicated: false })}>
              No, not really
            </ChoiceCard>
          </ChoiceRow>
          <GroupError>{err("hoNone")}</GroupError>

          {ho.hasDedicated ? (
            <>
              <div className={pair}>
                <FormField label="Office square footage" htmlFor="ap-officeSqFt" error={err("officeSqFt")}>
                  <NumberInput
                    id="ap-officeSqFt"
                    value={ho.officeSqFt}
                    placeholder="e.g., 150"
                    invalid={!!err("officeSqFt")}
                    onChange={(v) => {
                      set({ officeSqFt: v });
                      touch("officeSqFt");
                    }}
                  />
                </FormField>
                <FormField label="Home total square footage" htmlFor="ap-homeSqFt" error={err("homeSqFt")}>
                  <NumberInput
                    id="ap-homeSqFt"
                    value={ho.homeSqFt}
                    placeholder="e.g., 2000"
                    invalid={!!err("homeSqFt")}
                    onChange={(v) => {
                      set({ homeSqFt: v });
                      touch("homeSqFt");
                    }}
                  />
                </FormField>
              </div>
              {calc.pct !== null ? (
                <InfoCallout tone="neutral" title={`${calc.pct}% business use`}>
                  {ho.officeSqFt || 0} sq ft of {ho.homeSqFt || 0} sq ft total.
                </InfoCallout>
              ) : null}

              <ChoiceRow label="Own or rent">
                <ChoiceCard selected={ho.ownOrRent === "own"} onSelect={() => set({ ownOrRent: "own" })}>
                  Client owns their home
                </ChoiceCard>
                <ChoiceCard selected={ho.ownOrRent === "rent"} onSelect={() => set({ ownOrRent: "rent" })}>
                  Client rents their home
                </ChoiceCard>
              </ChoiceRow>
              <GroupError>{err("ownOrRent")}</GroupError>

              {ho.ownOrRent === "own" ? (
                <>
                  <div className={pair}>
                    {cost("mortgageInterest", "Mortgage interest (per month)*", "e.g., 1150")}
                    {cost("propertyTax", "Property taxes (per year)*", "e.g., 4500")}
                  </div>
                  <div className={pair}>
                    {cost("homeInsurance", "Homeowners insurance (per month)*", "e.g., 150")}
                    {cost("utilities", "Utilities (per month)*", "e.g., 300")}
                  </div>
                  <div className={pair}>
                    {cost("maintenance", "Maintenance (per month)*", "e.g., 100", MAINTENANCE_HINT)}
                    {cost("repairs", "Repairs (per year)*", "e.g., 1200", REPAIRS_HINT)}
                  </div>
                </>
              ) : ho.ownOrRent === "rent" ? (
                <>
                  <div className={pair}>
                    {cost("rentPaid", "Rent (per month)*", "e.g., 2000")}
                    {cost("homeInsurance", "Renters insurance (per month)*", "e.g., 35")}
                  </div>
                  <div className={pair}>
                    {cost("utilities", "Utilities (per month)*", "e.g., 300")}
                    {cost("maintenance", "Maintenance (per month)*", "e.g., 50", MAINTENANCE_HINT)}
                  </div>
                  {cost("repairs", "Repairs (per year)*", "e.g., 300", REPAIRS_HINT)}
                </>
              ) : null}
              {ho.ownOrRent ? <Hint className="-mt-2 mb-1">{PLANNING_NOTE}</Hint> : null}

              <CatchUpBlock
                group="ho"
                sec={ho}
                err={err}
                touch={touch}
                onChoose={(yes) => set({ catchUp: yes })}
                onDate={(iso) => set({ catchUpDate: iso })}
              />
            </>
          ) : null}

          <HomeOfficeRecommendation ho={ho} calc={calc} />
        </>
      ) : null}
    </>
  );
}

/* ───────────────────────────── 3 · Vehicles ───────────────────────────── */

const WEIGHT_CLASSES: [WeightClass, string][] = [
  ["standard", "Car, crossover, or small SUV (≤6,000 lbs)"],
  ["heavySuv", "Heavy SUV (6,001–14,000 lbs)"],
  ["heavyTruck", "Heavy truck/van (full cargo bed or >14,000 lbs)"],
  ["unsure", "Not sure"],
];

function VehicleRecommendation({
  v,
  calc,
  section,
  onToggleOverride,
}: {
  v: Vehicle;
  calc: VehicleCalc;
  section: VehiclesSection;
  onToggleOverride: () => void;
}) {
  const recLabel = calc.recommended === "actual" ? "Actual Expense Method" : "Standard Mileage Method";
  const effLabel = calc.effective === "actual" ? "Actual Expense Method" : "Standard Mileage Method";
  const isOverridden = calc.effective !== calc.recommended;
  const whyText =
    calc.recommended === "actual"
      ? "Actual costs" + (calc.depreciationDeduction > 0 ? " plus first-year depreciation" : "") + " come in " + money(calc.delta) + " higher than the mileage rate would give the client."
      : "The standard mileage rate comes in " + money(calc.delta) + " higher than actual costs" + (v.purchasedThisYear || (v.capitalLease && v.leaseStartedThisYear) ? " (even with depreciation)" : "") + " would this year.";
  const cuNote = catchUpNoteForEstimate(section);
  const docs = v.ownership ? vehicleDocItems(v, calc) : [];
  const bundle = v.ownership ? vehicleBundlingNote(v, calc) : "";
  const indent = "   — ";

  return (
    <RecommendBanner label={isOverridden ? "Currently using" : "Recommended"} title={isOverridden ? effLabel : recLabel}>
      <div className="mb-2 flex flex-wrap gap-x-[18px] gap-y-1 text-[12.5px] text-mist">
        <span>
          Mileage: <b className="font-semibold text-fog">{money(calc.mileageDeduction)}</b>
        </span>
        <span>
          Actual: <b className="font-semibold text-fog">{money(calc.actualTotal)}</b>
        </span>
      </div>
      {calc.actualTotal > 0 ? (
        <div className="-mt-1 mb-2 flex flex-wrap gap-x-[18px] gap-y-1 text-[11.5px] text-muted">
          <span>
            {indent}Operating costs: <b className="font-semibold text-mist">{money(calc.operatingDeduction)}</b>
          </span>
          {calc.leaseDeduction > 0 ? (
            <span>
              {indent}Lease payment: <b className="font-semibold text-mist">{money(calc.leaseDeduction)}</b>
            </span>
          ) : null}
          {calc.depreciationDeduction > 0 ? (
            <span>
              {indent}Depreciation: <b className="font-semibold text-mist">{money(calc.depreciationDeduction)}</b>
            </span>
          ) : null}
        </div>
      ) : null}
      <p className={why}>
        {isOverridden ? (
          <>
            Recommended: <strong className="font-semibold text-fog">{recLabel}</strong> &mdash;{" "}
          </>
        ) : null}
        {whyText}
        {calc.depreciationNote ? " " + calc.depreciationNote : ""}
      </p>
      {cuNote ? <p className={`${why} mt-1.5`}>{cuNote}</p> : null}
      {docs.length ? (
        <p className={`${why} mt-2`}>
          <strong className="font-semibold text-fog">Client will need to provide:</strong> {docs.join(", ")}
        </p>
      ) : null}
      {bundle ? <p className={smallNote}>{bundle}</p> : null}
      <div className="mt-3">
        <button type="button" onClick={onToggleOverride} className={btnCls("ghost", "sm")}>
          Use {calc.effective === "actual" ? "mileage" : "actual expense"} instead
        </button>
      </div>
    </RecommendBanner>
  );
}

type VehicleMoneyKey = "fuelCost" | "insuranceCost" | "maintenanceCost" | "leasePayment";

function VehicleCard({
  v,
  calc,
  section,
  err,
  touch,
  update,
}: {
  v: Vehicle;
  calc: VehicleCalc;
  section: VehiclesSection;
  err: StepProps["err"];
  touch: StepProps["touch"];
  update: Update;
}) {
  const idp = `ap-${v.id}`;
  const edit = (patch: Partial<Vehicle>) => patchVehicle(update, v.id, { ...patch, methodOverride: null });
  const nameErr = err("v_" + v.id);
  const milesErr = err("m_" + v.id);
  const priceErr = err("price_" + v.id);
  const ownErr = err("own_" + v.id);

  const cost = (key: VehicleMoneyKey, label: string, placeholder: string) => (
    <MoneyField
      id={`${idp}-${key}`}
      label={label}
      value={v[key]}
      placeholder={placeholder}
      onChange={(raw) => edit({ [key]: raw })}
    />
  );
  const fuel = cost("fuelCost", "Fuel/gas (per month)*", "e.g., 200");
  const insurance = cost("insuranceCost", "Insurance (per month)*", "e.g., 130");
  const maintenance = cost("maintenanceCost", "Maintenance & repairs (per year)*", "e.g., 900");

  const weightClass = (
    <FormField
      label="Vehicle weight class"
      htmlFor={`${idp}-weight`}
      hint="Check the client’s door-jamb sticker or title for GVWR if unsure."
    >
      <SelectInput
        id={`${idp}-weight`}
        value={v.weightClass}
        onChange={(e) => edit({ weightClass: e.target.value as WeightClass })}
      >
        {WEIGHT_CLASSES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectInput>
    </FormField>
  );

  const pct = Number(v.businessUsePct) || 0;

  return (
    <div className="mb-3.5 rounded-[16px] border border-edge bg-panel-2 p-[18px]">
      <div className="flex items-start gap-3">
        <FormField label="Vehicle description" htmlFor={`${idp}-label`} error={nameErr} className="mb-4 flex-1">
          <TextInput
            id={`${idp}-label`}
            value={v.label}
            placeholder="e.g., 2022 Honda CR-V"
            invalid={!!nameErr}
            onChange={(s) => {
              edit({ label: s });
              touch("v_" + v.id);
            }}
          />
        </FormField>
        <button
          type="button"
          onClick={() =>
            update((p) => ({
              ...p,
              vehicles: { ...p.vehicles, list: p.vehicles.list.filter((x) => x.id !== v.id) },
            }))
          }
          className="mt-[26px] flex-none cursor-pointer px-1 py-1.5 text-[12px] text-dusk underline underline-offset-2 transition-colors hover:text-magenta"
        >
          Remove
        </button>
      </div>

      <FormField
        label="Business miles (per month)*"
        htmlFor={`${idp}-miles`}
        error={milesErr}
        hint={"* Enter a typical month’s business miles — we’ll annualize it for the estimate below."}
      >
        <NumberInput
          id={`${idp}-miles`}
          value={v.annualMiles}
          step={10}
          placeholder="e.g., 650"
          invalid={!!milesErr}
          onChange={(s) => {
            edit({ annualMiles: s });
            touch("m_" + v.id);
          }}
        />
      </FormField>

      <ChoiceRow label="Owned or leased">
        <ChoiceCard selected={v.ownership === "owned"} onSelect={() => edit({ ownership: "owned" })}>
          Client owns this vehicle
        </ChoiceCard>
        <ChoiceCard selected={v.ownership === "leased"} onSelect={() => edit({ ownership: "leased" })}>
          Client leases this vehicle
        </ChoiceCard>
      </ChoiceRow>
      <GroupError>{ownErr}</GroupError>

      {v.ownership === "owned" ? (
        <>
          <div className={pair}>
            {fuel}
            {insurance}
          </div>
          {maintenance}
          <Hint className="-mt-2 mb-4">{PLANNING_NOTE}</Hint>
        </>
      ) : v.ownership === "leased" ? (
        <>
          <ToggleRow
            className="mb-3.5"
            title="Is this a capital lease?"
            desc="A capital lease (for example, a lease-to-own or finance lease) is treated like owning the vehicle — depreciation replaces the lease-payment deduction. The lease agreement will show it."
            checked={v.capitalLease}
            onChange={(c) => edit({ capitalLease: c })}
          />
          {v.capitalLease ? (
            <>
              <div className={pair}>
                {fuel}
                {insurance}
              </div>
              {maintenance}
            </>
          ) : (
            <>
              <div className={pair}>
                {cost("leasePayment", "Lease payment (per month)*", "e.g., 450")}
                {fuel}
              </div>
              <div className={pair}>
                {insurance}
                {maintenance}
              </div>
            </>
          )}
          <Hint className="-mt-2 mb-4">{PLANNING_NOTE}</Hint>
        </>
      ) : null}

      <div className="mb-5">
        <div className="mb-2.5 flex items-baseline gap-2">
          <span className="font-display text-[26px] font-bold tabular-nums text-magenta">{v.businessUsePct || 0}%</span>
          <span className="text-[12.5px] text-dusk">business use</span>
        </div>
        <Slider
          value={pct}
          min={0}
          max={100}
          step={5}
          ariaLabel="Business-use percentage"
          onChange={(n) => edit({ businessUsePct: String(n) })}
        />
        <div aria-hidden className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-panel-2">
          <span className="h-full w-1/2 bg-magenta/35" />
          <span className="h-full w-[30%] bg-ember/50" />
          <span className="h-full w-1/5 bg-teal/60" />
        </div>
        <div aria-hidden className="mt-2 flex justify-between font-mono text-[10px] tracking-[0.03em] text-dusk">
          <span>0&ndash;50</span>
          <span>50&ndash;79</span>
          <span>80&ndash;100</span>
        </div>
        <Hint className="mt-3">
          The IRS defines business use as business miles divided by total miles. A mileage log
          supports this percentage.
        </Hint>
      </div>

      {v.ownership === "owned" ? (
        <>
          <ToggleRow
            className="mb-3.5"
            title="Is this vehicle financed?"
            desc={"We’ll request the loan agreement for the file — it doesn’t change the reimbursement amount."}
            checked={v.isFinanced}
            onChange={(c) => edit({ isFinanced: c })}
          />
          <ToggleRow
            className="mb-3.5"
            title="Purchased this vehicle in 2026?"
            desc="Placed in service this tax year unlocks first-year depreciation."
            checked={v.purchasedThisYear}
            onChange={(c) => edit({ purchasedThisYear: c })}
          />
          {v.purchasedThisYear ? (
            <>
              <MoneyField
                id={`${idp}-purchasePrice`}
                label="Purchase price"
                value={v.purchasePrice}
                placeholder="e.g., 45000"
                error={priceErr}
                onChange={(raw) => {
                  edit({ purchasePrice: raw });
                  touch("price_" + v.id);
                }}
              />
              {weightClass}
            </>
          ) : null}
        </>
      ) : null}

      {v.ownership === "leased" && v.capitalLease ? (
        <>
          <ToggleRow
            className="mb-3.5"
            title="Did this lease begin in 2026?"
            desc="A lease that starts this tax year unlocks first-year depreciation."
            checked={v.leaseStartedThisYear}
            onChange={(c) => edit({ leaseStartedThisYear: c })}
          />
          {v.leaseStartedThisYear ? (
            <>
              <MoneyField
                id={`${idp}-leaseCost`}
                label="Capitalized cost"
                value={v.leaseCost}
                placeholder="e.g., 45000"
                hint="The agreed-upon value of the vehicle, shown on the lease agreement."
                error={priceErr}
                onChange={(raw) => {
                  edit({ leaseCost: raw });
                  touch("price_" + v.id);
                }}
              />
              {weightClass}
            </>
          ) : null}
        </>
      ) : null}

      <VehicleRecommendation
        v={v}
        calc={calc}
        section={section}
        onToggleOverride={() => {
          const target = calc.effective === "actual" ? "mileage" : "actual";
          patchVehicle(update, v.id, { methodOverride: target === calc.recommended ? null : target });
        }}
      />
    </div>
  );
}

export function VehicleStep({ plan, all, err, touch, update }: StepProps) {
  const vs = plan.vehicles;
  const atCap = vs.list.length >= MAX_VEHICLES;
  return (
    <>
      <StepHeader step={3} title="Business use of a vehicle">
        A few numbers per vehicle let us compare the standard mileage rate against actual costs
        &mdash; including first-year depreciation if the client owns and purchased it in 2026, or
        lease payments if they lease (or depreciation, if the lease is a capital lease).
      </StepHeader>

      <ToggleRow
        title="Include vehicle reimbursement"
        desc="Turn this on if the client drives a personal vehicle for business."
        checked={vs.included}
        onChange={(on) =>
          update((p) => ({
            ...p,
            vehicles: {
              ...p.vehicles,
              included: on,
              // Switching it on with nothing listed starts the first card.
              list:
                on && p.vehicles.list.length === 0
                  ? [newVehicle(nextVehicleSeq(p.vehicles.list))]
                  : p.vehicles.list,
            },
          }))
        }
      />

      {vs.included ? (
        <>
          {all.vehicles.map(({ v, calc }) => (
            <VehicleCard
              key={v.id}
              v={v}
              calc={calc}
              section={vs}
              err={err}
              touch={touch}
              update={update}
            />
          ))}
          <GroupError className="mt-0">{err("vehicles")}</GroupError>
          <button
            type="button"
            disabled={atCap}
            title={atCap ? `A plan holds up to ${MAX_VEHICLES} vehicles` : undefined}
            onClick={() =>
              update((p) => ({
                ...p,
                vehicles: {
                  ...p.vehicles,
                  list: [...p.vehicles.list, newVehicle(nextVehicleSeq(p.vehicles.list))],
                },
              }))
            }
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-edge-mid px-4 py-3 text-[13px] font-semibold text-muted transition-colors duration-150 hover:border-magenta hover:text-fog disabled:cursor-default disabled:opacity-40 disabled:hover:border-edge-mid disabled:hover:text-muted"
          >
            + Add a vehicle
          </button>
          <CatchUpBlock
            group="v"
            sec={vs}
            err={err}
            touch={touch}
            onChoose={(yes) => patchVehicles(update, { catchUp: yes })}
            onDate={(iso) => patchVehicles(update, { catchUpDate: iso })}
          />
        </>
      ) : null}
    </>
  );
}

/* ───────────────────────────── 4 · Timing ───────────────────────────── */

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="my-1 flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-2.5 rounded-[10px] border border-edge bg-panel-2 px-3.5 py-3 text-[13px] leading-relaxed text-muted"
        >
          <span aria-hidden className="font-bold text-magenta">
            &bull;
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TimingCell({ days, label, desc }: { days: string; label: string; desc: string }) {
  return (
    <div className="rounded-[10px] border border-edge bg-panel-2 p-3.5">
      <div className="font-display text-[22px] font-bold text-magenta">{days}</div>
      <div className="mb-1.5 mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{label}</div>
      <div className="text-[12px] leading-relaxed text-dusk">{desc}</div>
    </div>
  );
}

export function TimingStep({ plan, all, update }: StepProps) {
  const cadence = reimbursementCadenceNote(plan.reimbursementFrequency);
  const groups = getSubstantiationGroups(plan, all);
  const escrow = homeOfficeEscrowNote(plan.homeOffice);
  return (
    <>
      <StepHeader step={4} title="Substantiation & timing">
        These requirements follow from the elections made in the previous steps, plus the IRS
        Fixed-Date Method safe harbor.
      </StepHeader>

      <SectionLabel>Meeting cadence</SectionLabel>
      <Prompt>
        How often does the company meet with our team? The client calculates each reimbursement using
        the plan&rsquo;s reimbursement tracker, and payment happens at that meeting.
      </Prompt>
      <ChoiceRow label="Meeting cadence">
        <ChoiceCard
          tone="magenta"
          selected={plan.reimbursementFrequency === "monthly"}
          onSelect={() => update((p) => ({ ...p, reimbursementFrequency: "monthly" }))}
        >
          Monthly &mdash; we meet monthly
        </ChoiceCard>
        <ChoiceCard
          tone="magenta"
          selected={plan.reimbursementFrequency === "quarterly"}
          onSelect={() => update((p) => ({ ...p, reimbursementFrequency: "quarterly" }))}
        >
          Quarterly &mdash; we meet quarterly
        </ChoiceCard>
      </ChoiceRow>
      {cadence ? (
        <InfoCallout tone="amber" title="Keep the tracker current" className="mb-6">
          {cadence}
        </InfoCallout>
      ) : null}

      <SectionLabel>Documentation the policy will require</SectionLabel>
      {groups.length ? (
        groups.map((g) => (
          <Fragment key={g.label}>
            <div className="mb-2 mt-4 text-[12.5px] font-bold text-muted">{g.label}</div>
            <Checklist items={g.items} />
          </Fragment>
        ))
      ) : (
        <Checklist items={["Complete the Home Office and Vehicle steps to see what the client will need to provide."]} />
      )}
      {escrow ? <Hint className="mb-4 mt-2">{escrow}</Hint> : null}

      <SectionLabel>The Fixed-Date Method</SectionLabel>
      <Prompt>
        The safe harbor under Treasury Regulation &sect; 1.62-2(g)(2)(i). It applies automatically
        &mdash; no election needed.
      </Prompt>
      <div className="mb-1.5 mt-1 grid gap-2.5 sm:grid-cols-3">
        <TimingCell days="30" label="Advance" desc="Any advance happens within 30 days of the expected cost." />
        <TimingCell days="60" label="Substantiate" desc="Log and document each expense within 60 days." />
        <TimingCell days="120" label="Return excess" desc="Any excess advance is returned within 120 days." />
      </div>
    </>
  );
}

/* ───────────────────────────── 5 · Review & sign ───────────────────────────── */

/** The typed name in script, on paper — what lands on the signature line. */
function ESignaturePreview({ name }: { name: string }) {
  const n = name.trim();
  return (
    <div className="mb-4 mt-1 rounded-[10px] border border-dashed border-[#D9D5C8] bg-[#FBFAF6] px-4 pb-2.5 pt-3.5">
      <div className="mb-1.5 font-body text-[11px] uppercase tracking-[0.04em] text-[#6B6D74]">
        Electronic signature
      </div>
      <div
        className={`${greatVibes.className} min-h-[40px] border-b border-[#1B1B1F] pb-1 text-[34px] leading-[1.15] ${
          n ? "text-[#1B1B1F]" : "text-[#A9AAB0]"
        }`}
      >
        {n || "Type your name above"}
      </div>
    </div>
  );
}

export function ReviewStep({
  plan,
  err,
  touch,
  update,
  onDownloadTracker,
}: StepProps & { onDownloadTracker: () => void }) {
  return (
    <>
      <StepHeader step={5} title="Review & sign">
        Check the document preview, then complete the signature block. This adopts the policy for the
        client&rsquo;s company.
      </StepHeader>

      <FormField label="Signer name" htmlFor="ap-signerName" error={err("signerName")}>
        <TextInput
          id="ap-signerName"
          value={plan.signerName}
          placeholder="e.g., Jordan Lee"
          invalid={!!err("signerName")}
          onChange={(v) => {
            update((p) => ({ ...p, signerName: v }));
            touch("signerName");
          }}
        />
      </FormField>
      <ESignaturePreview name={plan.signerName} />

      <div className={pair}>
        <FormField label="Signer title" htmlFor="ap-signerTitle" error={err("signerTitle")}>
          <TextInput
            id="ap-signerTitle"
            value={plan.signerTitle}
            placeholder="e.g., President"
            invalid={!!err("signerTitle")}
            onChange={(v) => {
              update((p) => ({ ...p, signerTitle: v }));
              touch("signerTitle");
            }}
          />
        </FormField>
        <DateField
          id="ap-signDate"
          label="Date signed"
          value={plan.signDate}
          onChange={(iso) => update((p) => ({ ...p, signDate: iso }))}
        />
      </div>

      <InfoCallout tone="neutral" title="Ready to finish">
        Once this looks right, use Print / Save as PDF or Download in the document panel to get the
        signed copy.
      </InfoCallout>
      {plan.homeOffice.included || plan.vehicles.included ? (
        <InfoCallout tone="teal" title="Reimbursement tracker" className="mt-3.5">
          Generate a spreadsheet, built from this plan&rsquo;s elections, for the client to calculate
          their own periodic reimbursements going forward.
          <div>
            <button type="button" onClick={onDownloadTracker} className={`${btnCls("ghost", "sm")} mt-2.5`}>
              Download reimbursement tracker (.xlsx)
            </button>
          </div>
        </InfoCallout>
      ) : null}
    </>
  );
}
