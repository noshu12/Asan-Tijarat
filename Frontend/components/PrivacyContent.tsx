export default function PrivacyContent() {
  return (
    <div className="space-y-8 text-gray-700">
      <p>
        This Privacy Policy explains what information Asan Tijarat collects,
        how it is used, and how it is protected. Asan Tijarat is a
        business-to-business wholesale marketplace that connects shopkeepers
        with suppliers. By creating an account or using this website, you
        agree to this policy. If you do not agree, please do not use the
        platform.
      </p>
      <p className="text-sm text-gray-500">Last updated: 30 October 2026</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">1. Information we collect</h2>
        <p>When you register and use Asan Tijarat, we collect:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account details:</strong> your name, email address, phone
            number, and password. Passwords are stored in hashed form and
            are never kept in plain text.
          </li>
          <li>
            <strong>Business details:</strong> business or shop name, city,
            and your product categories (suppliers) or shop type
            (shopkeepers).
          </li>
          <li>
            <strong>Tax and billing identifiers:</strong> NTN number
            (suppliers) or shop utility bill account number (shopkeepers).
          </li>
          <li>
            <strong>Locations:</strong> warehouse location (suppliers), or
            house and shop locations (shopkeepers).
          </li>
          <li>
            <strong>KYC documents:</strong> CNIC front and back for all
            users, plus the NTN document (suppliers) or the shop utility
            bill (shopkeepers).
          </li>
          <li>
            <strong>Orders:</strong> products ordered, quantities, prices,
            order status, and delivery addresses.
          </li>
          <li>
            <strong>Messages:</strong> anything you send through the contact
            form.
          </li>
          <li>
            <strong>Technical records:</strong> sign-in sessions and a log
            of administrative actions taken on accounts, kept for security.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">2. How we use your information</h2>
        <p>We use the information we collect to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Verify your identity and business before activating your account.</li>
          <li>Operate the marketplace — listings, orders, and delivery coordination.</li>
          <li>Communicate with you about your account, orders, verification, and support requests.</li>
          <li>Keep the platform secure, prevent misuse, and investigate abuse.</li>
          <li>Meet legal and record-keeping obligations.</li>
        </ul>
        <p>We do not sell your personal information to anyone.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">3. KYC documents are never public</h2>
        <p>
          Your CNIC documents, NTN document, and utility bill are collected
          only for account verification. They are never published on the
          website and are never visible to other users. They can be viewed
          only by an admin through an authenticated route, for verification
          purposes.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">4. What other users can see</h2>
        <p>
          To make trade possible, some business information is visible to
          other users: your business or shop name, city, categories or shop
          type, and your product listings with prices. When you trade with
          someone, that party can also see the order details and the
          delivery information needed to fulfil the order.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">5. Cookies and sessions</h2>
        <p>
          When you sign in, we store a secure, httpOnly session cookie in
          your browser. It cannot be read by JavaScript on the page. A
          session lasts 7 days, and signing in on a new device or browser
          ends the previous session.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">6. Sharing of information</h2>
        <p>
          We share your information only as needed to run the platform —
          for example, sending you emails about verification, orders, and
          support replies. We do not share your KYC documents with anyone
          outside the admin verification process. We may disclose
          information if required by law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">7. How long we keep information</h2>
        <p>
          We keep your information while your account is active. Records of
          completed orders are kept afterwards for business and legal
          record-keeping, even if you close your account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">8. Your choices</h2>
        <p>
          You can view and update your business profile from the Settings
          page after signing in. You can request closure of your account
          through the contact form on this website. Closing an account does
          not remove records that we are required to keep for completed
          orders.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">9. Security</h2>
        <p>
          We take reasonable steps to protect your information, including
          hashed passwords, authenticated admin-only access to documents,
          and session controls. No method of transmission or storage is
          completely secure, so we cannot guarantee absolute security.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">10. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. The updated version
          will be published on this page. Continued use of the platform
          after an update means you accept the updated policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">11. Contact</h2>
        <p>
          For questions about this policy or your information, you can
          reach us through the contact form on this website.
        </p>
      </section>
    </div>
  );
}
