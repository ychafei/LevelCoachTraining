import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  Grid2X2,
  Instagram,
  Link as LinkIcon,
  Lock,
  Mail,
  MapPin,
  Palette,
  Phone,
  ShieldCheck,
  UploadCloud,
  User,
  Users,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { GoogleIcon } from '@/components/auth/authPrimitives';
import { organizationMemberRepo, organizationRepo } from '@/api/repo';
import { auth } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';
import { storage } from '@/lib/storage';
import { onboardingPath } from '@/lib/roleHome';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+\..+/i;
const INSTAGRAM_RE = /^@?[A-Za-z0-9._]{1,30}$/;

const PASSWORD_RULES = [
  { id: 'length', label: '8+ characters', test: (value) => value.length >= 8 },
  { id: 'upper', label: '1 uppercase', test: (value) => /[A-Z]/.test(value) },
  { id: 'lower', label: '1 lowercase', test: (value) => /[a-z]/.test(value) },
  { id: 'number', label: '1 number', test: (value) => /\d/.test(value) },
  { id: 'special', label: '1 special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

const ORGANIZATION_TYPES = [
  'Private training academy',
  'Independent coaching group',
  'Club program',
  'School program',
  'Strength & conditioning facility',
  'Other',
];

const COACH_COUNTS = ['1-2 coaches', '3-5 coaches', '6-10 coaches', '11-25 coaches', '25+ coaches'];

export default function CreateOrganization() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth, user, refetchUser } = useAuth();

  const [form, setForm] = useState({
    organizationName: '',
    slug: '',
    organizationType: '',
    serviceArea: '',
    primarySports: '',
    coachCount: '',
    organizationEmail: '',
    organizationPhone: '',
    website: '',
    instagram: '',
    description: '',
    primaryColor: '#2563eb',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    adminPhone: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
    updatesOptIn: false,
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoError, setLogoError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) })),
    [form.password],
  );
  const passwordValid = passwordChecks.every((check) => check.ok);
  const passwordsMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword;
  const descriptionCount = form.description.length;
  const initials = getOrganizationInitials(form.organizationName);
  const safePrimaryColor = isValidHexColor(form.primaryColor) ? form.primaryColor : '#2563eb';
  const usingExistingAccount = isAuthenticated && !!user;

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      adminFirstName: current.adminFirstName || user.first_name || splitFirstName(user.name),
      adminLastName: current.adminLastName || user.last_name || splitLastName(user.name),
      adminEmail: user.email || current.adminEmail,
      adminPhone: current.adminPhone || user.phone || '',
    }));
  }, [user]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const updateOrganizationName = (value) => {
    setForm((current) => ({
      ...current,
      organizationName: value,
      slug: slugTouched ? current.slug : slugify(value),
    }));
    setErrors((current) => ({ ...current, organizationName: undefined, slug: undefined }));
  };

  const updateSlug = (value) => {
    setSlugTouched(true);
    updateForm('slug', slugify(value));
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0] || null;
    setLogoError('');

    if (!file) {
      setLogoFile(null);
      return;
    }

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setLogoFile(null);
      setLogoError('Logo must be a PNG or JPG.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLogoFile(null);
      setLogoError('Logo must be 5 MB or smaller.');
      return;
    }

    setLogoFile(file);
  };

  const validate = () => {
    const next = {};
    if (!form.organizationName.trim()) next.organizationName = 'Organization name is required.';
    if (!form.slug.trim()) next.slug = 'URL slug is required.';
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) next.slug = 'Use lowercase letters, numbers, and hyphens.';
    if (!form.organizationType) next.organizationType = 'Organization type is required.';
    if (!form.serviceArea.trim()) next.serviceArea = 'Service area is required.';
    if (!form.primarySports.trim()) next.primarySports = 'At least one sport is required.';
    if (!form.coachCount) next.coachCount = 'Coach count is required.';
    if (!form.organizationEmail.trim()) next.organizationEmail = 'Organization email is required.';
    else if (!EMAIL_RE.test(form.organizationEmail.trim())) next.organizationEmail = 'Enter a valid organization email.';
    if (!form.organizationPhone.trim()) next.organizationPhone = 'Organization phone is required.';
    if (form.website.trim() && !URL_RE.test(form.website.trim())) next.website = 'Use a full URL, like https://example.com.';
    if (form.instagram.trim() && !INSTAGRAM_RE.test(form.instagram.trim())) next.instagram = 'Enter a valid Instagram handle.';
    if (!form.description.trim()) next.description = 'Organization description is required.';
    if (!isValidHexColor(form.primaryColor)) next.primaryColor = 'Use a valid 6-digit hex color.';
    if (!form.adminFirstName.trim()) next.adminFirstName = 'Admin first name is required.';
    if (!form.adminLastName.trim()) next.adminLastName = 'Admin last name is required.';
    if (!form.adminEmail.trim()) next.adminEmail = 'Admin email is required.';
    else if (!EMAIL_RE.test(form.adminEmail.trim())) next.adminEmail = 'Enter a valid admin email.';
    if (!form.adminPhone.trim()) next.adminPhone = 'Admin phone is required.';
    if (!usingExistingAccount) {
      if (!form.password) next.password = 'Password is required.';
      else if (!passwordValid) next.password = 'Password does not meet the requirements below.';
      if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password.';
      else if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    }
    if (!form.termsAccepted) next.termsAccepted = 'You must agree to the terms and code of conduct.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      let currentUser = user;
      if (!usingExistingAccount) {
        await auth.signOut();
        currentUser = await auth.signUp(form.adminEmail.trim(), form.password);
      } else {
        currentUser = await refetchUser();
      }
      if (!currentUser?.id) {
        throw new Error('Could not load the organization owner profile.');
      }

      const logoUpload = logoFile ? await storage.uploadFile('org-logos', logoFile) : null;
      const organization = await organizationRepo.create({
        name: form.organizationName.trim(),
        slug: form.slug.trim(),
        type: form.organizationType,
        status: 'draft',
        service_area_label: form.serviceArea.trim(),
        radius_miles: 15,
        logo_file_id: logoUpload?.id || '',
        brand_color: safePrimaryColor,
        payout_model: 'organization',
        created_by_profile_id: currentUser.id,
        contact_email: form.organizationEmail.trim(),
        contact_phone: form.organizationPhone.trim(),
        website_url: form.website.trim(),
        instagram_handle: normalizeInstagram(form.instagram),
        primary_sports: form.primarySports.trim(),
        coach_count_label: form.coachCount,
        description: form.description.trim(),
        updates_opt_in: form.updatesOptIn,
      });

      await organizationMemberRepo.create({
        organization_id: organization.id,
        profile_id: currentUser.id,
        role: 'org_owner',
        status: 'active',
        invited_by: currentUser.id,
        accepted_at: new Date().toISOString(),
      });

      await auth.updateCurrentUser({
        role: 'user',
        onboarding_role: 'organization',
        onboarding_status: 'complete',
        first_name: form.adminFirstName.trim(),
        last_name: form.adminLastName.trim(),
        phone: form.adminPhone.trim(),
        terms_accepted: true,
        profile_setup_complete: true,
        primary_organization_id: organization.id,
        bio: buildOrganizationBio(form, logoFile, logoUpload?.id),
      });
      await refetchUser();
      setSubmitted(true);
    } catch (err) {
      const code = err?.code;
      const type = err?.type;
      if (code === 409 || type === 'user_already_exists') {
        setFormError('An account with that admin email already exists. Sign in instead.');
      } else {
        setFormError(err?.message || 'Could not create your organization account.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setFormError(null);
    try {
      if (usingExistingAccount) {
        navigate(onboardingPath('/create-organization', 'organization'));
        return;
      }
      await auth.signOut();
      auth.createOAuthSession('google', onboardingPath('/create-organization', 'organization'));
    } catch (err) {
      setFormError(err?.message || 'Could not start Google sign-up.');
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-950">
        <Navbar />
        <main className="flex min-h-screen items-center justify-center px-4 pt-20">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-2xl shadow-slate-950/10">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h1 className="mt-6 font-sans text-3xl font-extrabold tracking-normal text-slate-950 normal-case">
              Organization account created
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your organization setup is saved as a draft. You can continue shaping the portal before publishing it publicly.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate('/organization')}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                Open organization portal
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Back to platform
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-950">
      <Navbar />

      <main className="pt-20">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-slate-50/80 to-white px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10">
            <div className="px-6 py-7 sm:px-9 lg:px-8 xl:px-10">
              <div className="mx-auto w-full max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">
                  <Building2 className="h-4 w-4" />
                  Organization
                </div>

                <h1 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-normal text-slate-950 normal-case sm:text-4xl">
                  Create your organization account
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Launch your branded training portal and manage coaches, athletes, and programs in one place.
                </p>

                <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
                  <FormSection title="Organization details">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <AuthField
                        id="organization-name"
                        label="Organization name"
                        icon={Building2}
                        placeholder="Enter organization name"
                        value={form.organizationName}
                        onChange={(event) => updateOrganizationName(event.target.value)}
                        error={errors.organizationName}
                        disabled={submitting}
                      />
                      <AuthField
                        id="organization-slug"
                        label="URL slug"
                        icon={LinkIcon}
                        placeholder="rise-training"
                        value={form.slug}
                        onChange={(event) => updateSlug(event.target.value)}
                        error={errors.slug}
                        disabled={submitting}
                      />
                    </div>

                    <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
                      Portal URL preview: levelcoach.com/{form.slug || 'your-organization'}
                    </p>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <SelectField
                        id="organization-type"
                        label="Organization type"
                        icon={Grid2X2}
                        value={form.organizationType}
                        onChange={(event) => updateForm('organizationType', event.target.value)}
                        error={errors.organizationType}
                        disabled={submitting}
                      >
                        <option value="">Select organization type</option>
                        {ORGANIZATION_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </SelectField>
                      <AuthField
                        id="organization-service-area"
                        label="Primary location / service area"
                        icon={MapPin}
                        placeholder="City, State or Region"
                        value={form.serviceArea}
                        onChange={(event) => updateForm('serviceArea', event.target.value)}
                        error={errors.serviceArea}
                        disabled={submitting}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <AuthField
                        id="organization-sports"
                        label="Primary sport or sports"
                        icon={ShieldCheck}
                        placeholder="e.g., Basketball, Soccer, Strength Training"
                        value={form.primarySports}
                        onChange={(event) => updateForm('primarySports', event.target.value)}
                        error={errors.primarySports}
                        disabled={submitting}
                      />
                      <SelectField
                        id="organization-coaches"
                        label="Estimated number of coaches"
                        icon={Users}
                        value={form.coachCount}
                        onChange={(event) => updateForm('coachCount', event.target.value)}
                        error={errors.coachCount}
                        disabled={submitting}
                      >
                        <option value="">Select number of coaches</option>
                        {COACH_COUNTS.map((count) => (
                          <option key={count} value={count}>{count}</option>
                        ))}
                      </SelectField>
                    </div>
                  </FormSection>

                  <FormSection title="Contact and branding">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <AuthField
                        id="organization-email"
                        label="Organization email"
                        type="email"
                        icon={Mail}
                        placeholder="hello@youracademy.com"
                        value={form.organizationEmail}
                        onChange={(event) => updateForm('organizationEmail', event.target.value)}
                        error={errors.organizationEmail}
                        disabled={submitting}
                      />
                      <AuthField
                        id="organization-phone"
                        label="Organization phone"
                        type="tel"
                        icon={Phone}
                        placeholder="(248) 555-0123"
                        value={form.organizationPhone}
                        onChange={(event) => updateForm('organizationPhone', event.target.value)}
                        error={errors.organizationPhone}
                        disabled={submitting}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <AuthField
                        id="organization-website"
                        label="Website"
                        icon={Globe}
                        placeholder="https://yourwebsite.com"
                        value={form.website}
                        onChange={(event) => updateForm('website', event.target.value)}
                        error={errors.website}
                        disabled={submitting}
                      />
                      <AuthField
                        id="organization-instagram"
                        label="Instagram"
                        icon={Instagram}
                        placeholder="@youracademy"
                        value={form.instagram}
                        onChange={(event) => updateForm('instagram', event.target.value)}
                        error={errors.instagram}
                        disabled={submitting}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <LogoUploader
                        logoFile={logoFile}
                        logoPreview={logoPreview}
                        logoError={logoError}
                        initials={initials}
                        primaryColor={safePrimaryColor}
                        onChange={handleLogoChange}
                        disabled={submitting}
                      />
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="organization-color" className="mb-2 block text-sm font-bold text-slate-950">
                            Primary brand color
                          </label>
                          <div className="flex items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2">
                            <Palette className="h-4 w-4 text-slate-500" />
                            <input
                              id="organization-color"
                              type="color"
                              value={safePrimaryColor}
                              onChange={(event) => updateForm('primaryColor', event.target.value)}
                              disabled={submitting}
                              className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0 disabled:cursor-not-allowed"
                            />
                            <input
                              aria-label="Primary brand color hex"
                              value={form.primaryColor}
                              onChange={(event) => updateForm('primaryColor', event.target.value)}
                              disabled={submitting}
                              className="h-8 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-slate-700 outline-none disabled:cursor-not-allowed"
                            />
                          </div>
                          {errors.primaryColor && <p className="mt-1.5 text-xs font-semibold text-red-600">{errors.primaryColor}</p>}
                        </div>
                        <TextAreaField
                          id="organization-description"
                          label="Organization description"
                          placeholder="Tell athletes and families what your organization offers..."
                          value={form.description}
                          onChange={(event) => updateForm('description', event.target.value)}
                          error={errors.description}
                          maxLength={700}
                          rows={4}
                          count={descriptionCount}
                          disabled={submitting}
                        />
                      </div>
                    </div>
                  </FormSection>

                  <FormSection title="Admin account">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <AuthField
                        id="admin-first-name"
                        label="Admin first name"
                        icon={User}
                        placeholder="First name"
                        value={form.adminFirstName}
                        onChange={(event) => updateForm('adminFirstName', event.target.value)}
                        error={errors.adminFirstName}
                        disabled={submitting}
                      />
                      <AuthField
                        id="admin-last-name"
                        label="Admin last name"
                        icon={User}
                        placeholder="Last name"
                        value={form.adminLastName}
                        onChange={(event) => updateForm('adminLastName', event.target.value)}
                        error={errors.adminLastName}
                        disabled={submitting}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <AuthField
                        id="admin-email"
                        label="Admin email"
                        type="email"
                        icon={Mail}
                        placeholder="you@example.com"
                        value={form.adminEmail}
                        onChange={(event) => updateForm('adminEmail', event.target.value)}
                        error={errors.adminEmail}
                        disabled={submitting || usingExistingAccount}
                      />
                      <AuthField
                        id="admin-phone"
                        label="Admin phone"
                        type="tel"
                        icon={Phone}
                        placeholder="(248) 555-0123"
                        value={form.adminPhone}
                        onChange={(event) => updateForm('adminPhone', event.target.value)}
                        error={errors.adminPhone}
                        disabled={submitting}
                      />
                    </div>

                    {usingExistingAccount ? (
                      <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
                        You are signed in as {user.email}. This organization will be attached to your current account.
                      </p>
                    ) : (
                      <>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <AuthField
                            id="organization-password"
                            label="Password"
                            type={showPassword ? 'text' : 'password'}
                            icon={Lock}
                            placeholder="Create a password"
                            value={form.password}
                            onChange={(event) => updateForm('password', event.target.value)}
                            error={errors.password}
                            disabled={submitting}
                            trailing={
                              <button
                                type="button"
                                onClick={() => setShowPassword((value) => !value)}
                                className="rounded-md p-1.5 text-slate-500 transition-colors hover:text-slate-800"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            }
                          />
                          <AuthField
                            id="organization-confirm-password"
                            label="Confirm password"
                            type={showConfirm ? 'text' : 'password'}
                            icon={Lock}
                            placeholder="Confirm your password"
                            value={form.confirmPassword}
                            onChange={(event) => updateForm('confirmPassword', event.target.value)}
                            error={errors.confirmPassword}
                            disabled={submitting}
                            trailing={
                              <button
                                type="button"
                                onClick={() => setShowConfirm((value) => !value)}
                                className="rounded-md p-1.5 text-slate-500 transition-colors hover:text-slate-800"
                                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                              >
                                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            }
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {passwordChecks.map((check) => (
                            <span
                              key={check.id}
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold ${
                                check.ok
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-500'
                              }`}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {check.label}
                            </span>
                          ))}
                          {form.confirmPassword && (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold ${
                                passwordsMatch
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-red-200 bg-red-50 text-red-700'
                              }`}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </FormSection>

                  <div className="space-y-2">
                    <CheckboxRow
                      checked={form.termsAccepted}
                      onChange={(checked) => updateForm('termsAccepted', checked)}
                      disabled={submitting}
                    >
                      I agree to the{' '}
                      <Link to="/terms" className="font-semibold text-blue-700 hover:underline">
                        Terms of Service
                      </Link>
                      ,{' '}
                      <Link to="/privacy" className="font-semibold text-blue-700 hover:underline">
                        Privacy Policy
                      </Link>
                      , and LevelCoach Code of Conduct.
                    </CheckboxRow>
                    {errors.termsAccepted && <p className="text-xs font-semibold text-red-600">{errors.termsAccepted}</p>}

                    <CheckboxRow
                      checked={form.updatesOptIn}
                      onChange={(checked) => updateForm('updatesOptIn', checked)}
                      disabled={submitting}
                    >
                      Send me product updates and helpful tips.
                    </CheckboxRow>
                  </div>

                  {formError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                      {formError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-10 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting
                      ? 'Creating organization...'
                      : usingExistingAccount
                        ? 'Create Organization'
                        : 'Create Organization Account'}
                  </button>
                </form>

                {!usingExistingAccount && (
                  <>
                    <div className="my-3 flex items-center gap-4">
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-xs font-medium text-slate-500">or sign up with</span>
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogle}
                      disabled={submitting || isLoadingAuth}
                      className="flex h-9 w-full items-center justify-center gap-3 rounded-md border border-blue-200 bg-white text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <GoogleIcon className="h-4 w-4" />
                      Continue with Google
                    </button>

                    <p className="mt-4 text-center text-sm text-slate-600">
                      Already have an account?{' '}
                      <Link to="/sign-in" className="font-semibold text-blue-700 hover:underline">
                        Sign in
                      </Link>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <AuthFooter />
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <section className="border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
      <h2 className="mb-3 font-sans text-base font-extrabold tracking-normal text-slate-950 normal-case">
        {title}
      </h2>
      {children}
    </section>
  );
}

function AuthField({
  id,
  label,
  icon: Icon,
  error,
  trailing,
  onChange,
  ...inputProps
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-950">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          id={id}
          onChange={onChange}
          className={`h-9 w-full rounded-md border bg-white pl-10 text-sm text-slate-950 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
            trailing ? 'pr-10' : 'pr-3'
          } ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
          }`}
          aria-invalid={error ? 'true' : undefined}
          {...inputProps}
        />
        {trailing && <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

function SelectField({
  id,
  label,
  icon: Icon,
  error,
  children,
  onChange,
  ...selectProps
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-950">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <select
          id={id}
          onChange={onChange}
          className={`h-9 w-full appearance-none rounded-md border bg-white pl-10 pr-10 text-sm text-slate-950 transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
          }`}
          aria-invalid={error ? 'true' : undefined}
          {...selectProps}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

function TextAreaField({
  id,
  label,
  error,
  count,
  maxLength,
  onChange,
  ...textAreaProps
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-950">
        {label}
      </label>
      <textarea
        id={id}
        onChange={onChange}
        maxLength={maxLength}
        className={`min-h-24 w-full resize-none rounded-md border bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
        }`}
        aria-invalid={error ? 'true' : undefined}
        {...textAreaProps}
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : <span />}
        <p className="text-xs font-semibold text-slate-400">{count} / {maxLength}</p>
      </div>
    </div>
  );
}

function LogoUploader({
  logoFile,
  logoPreview,
  logoError,
  initials,
  primaryColor,
  onChange,
  disabled,
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-950">
        Organization logo
      </label>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid grid-cols-2 gap-3">
          <LogoBox
            label="Light preview"
            logoPreview={logoPreview}
            initials={initials}
            primaryColor={primaryColor}
            dark={false}
          />
          <LogoBox
            label="Dark preview"
            logoPreview={logoPreview}
            initials={initials}
            primaryColor={primaryColor}
            dark
          />
        </div>
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-blue-300 bg-white px-3 py-3 text-xs font-bold text-blue-700 transition hover:bg-blue-50">
          <UploadCloud className="h-4 w-4" />
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={onChange}
            disabled={disabled}
          />
          {logoFile ? logoFile.name : 'Upload PNG or JPG logo'}
        </label>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Square preview, centered with padding. Recommended: 512x512 or larger. Transparent PNG works best.
        </p>
        {logoError && <p className="mt-2 text-xs font-semibold text-red-600">{logoError}</p>}
      </div>
    </div>
  );
}

function LogoBox({ label, logoPreview, initials, primaryColor, dark }) {
  return (
    <div>
      <div
        className={`grid aspect-square place-items-center rounded-md border p-4 ${
          dark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'
        }`}
      >
        {logoPreview ? (
          <img
            src={logoPreview}
            alt="Organization logo preview"
            className="h-full w-full object-contain"
          />
        ) : (
          <div
            className="grid h-16 w-16 place-items-center rounded-xl text-lg font-extrabold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            {initials}
          </div>
        )}
      </div>
      <p className={`mt-1 text-center text-xs font-semibold ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
        {label}
      </p>
    </div>
  );
}

function CheckboxRow({ checked, onChange, disabled, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-5 text-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
      />
      <span>{children}</span>
    </label>
  );
}

function AuthFooter() {
  return (
    <footer className="bg-white">
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-6 px-4 py-6 sm:px-6 md:flex-row lg:px-8">
        <img src="/levelcoach-wordmark.png" alt="LevelCoach Training" className="h-12 w-auto object-contain" />
        <p className="text-sm text-slate-500">
          © {new Date().getFullYear()} LevelCoach Training. All rights reserved.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm">
          <Link to="/terms" className="text-slate-500 transition-colors hover:text-blue-700">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-slate-500 transition-colors hover:text-blue-700">
            Privacy Policy
          </Link>
          <Link to="/resources" className="text-slate-500 transition-colors hover:text-blue-700">
            Support
          </Link>
          <span className="inline-flex items-center gap-2 text-slate-500">
            English
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>
      </div>
    </footer>
  );
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function isValidHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function getOrganizationInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LC';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function splitFirstName(name) {
  return (name || '').trim().split(/\s+/).filter(Boolean)[0] || '';
}

function splitLastName(name) {
  return (name || '').trim().split(/\s+/).filter(Boolean).slice(1).join(' ');
}

function normalizeInstagram(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function buildOrganizationBio(form, logoFile, logoFileId = '') {
  return [
    form.description.trim(),
    '',
    '[Organization setup draft]',
    `Organization name: ${form.organizationName.trim()}`,
    `URL slug: ${form.slug.trim()}`,
    `Organization type: ${form.organizationType}`,
    `Primary sports: ${form.primarySports.trim()}`,
    `Service area: ${form.serviceArea.trim()}`,
    `Coach count: ${form.coachCount}`,
    `Organization email: ${form.organizationEmail.trim()}`,
    `Organization phone: ${form.organizationPhone.trim()}`,
    form.website.trim() ? `Website: ${form.website.trim()}` : '',
    form.instagram.trim() ? `Instagram: ${form.instagram.trim()}` : '',
    `Primary brand color: ${form.primaryColor}`,
    logoFile ? `Logo selected: ${logoFile.name}` : 'Logo selected: no',
    logoFileId ? `Logo file id: ${logoFileId}` : '',
    `Product updates: ${form.updatesOptIn ? 'yes' : 'no'}`,
  ].filter(Boolean).join('\n');
}
