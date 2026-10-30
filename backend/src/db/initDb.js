import { getPool, sql } from './pool.js';
import { hashPassword } from '../utils/password.js';

const schema = `
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Medication' AND xtype='U')
CREATE TABLE Medication (
    MedicationId   INT IDENTITY(1,1) PRIMARY KEY,
    MedicineName   NVARCHAR(200) NOT NULL,
    GenericName    NVARCHAR(200) NULL,
    Category       NVARCHAR(100) NULL,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedAt      DATETIME NOT NULL DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LabTest' AND xtype='U')
CREATE TABLE LabTest (
    TestId         INT IDENTITY(1,1) PRIMARY KEY,
    TestName       NVARCHAR(200) NOT NULL,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedAt      DATETIME NOT NULL DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Employee' AND xtype='U')
CREATE TABLE Employee (
    EmployeeId   INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
    MobileNo     NVARCHAR(20) NULL,
    Address      NVARCHAR(500) NULL,
    EmpType      NVARCHAR(50) NULL,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedAt    DATETIME NOT NULL DEFAULT GETDATE()
);

-- Consultation fee, applicable only to EmpType='Doctor'. Feeds the Doctor
-- picker on Billing > Patient Bill.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='DoctorFee' AND Object_ID=Object_ID('Employee'))
    ALTER TABLE Employee ADD DoctorFee DECIMAL(10,2) NULL;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmployeeShift' AND xtype='U')
CREATE TABLE EmployeeShift (
    ShiftId     INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeId  INT NOT NULL,
    DayOfWeek   NVARCHAR(10) NULL,
    FromTime    NVARCHAR(12) NULL,
    ToTime      NVARCHAR(12) NULL,
    CONSTRAINT FK_EmployeeShift_Employee FOREIGN KEY (EmployeeId)
        REFERENCES Employee(EmployeeId) ON DELETE CASCADE
);

-- Add DayOfWeek if the table already existed without it
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='DayOfWeek' AND Object_ID=Object_ID('EmployeeShift'))
    ALTER TABLE EmployeeShift ADD DayOfWeek NVARCHAR(10) NULL;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Patient' AND xtype='U')
CREATE TABLE Patient (
    PatientId    INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
    MobileNo     NVARCHAR(20) NULL,
    Address      NVARCHAR(500) NULL,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedAt    DATETIME NOT NULL DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Age' AND Object_ID=Object_ID('Patient'))
    ALTER TABLE Patient ADD Age INT NULL;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='VitalSign' AND xtype='U')
CREATE TABLE VitalSign (
    VitalId        INT IDENTITY(1,1) PRIMARY KEY,
    PatientId      INT NOT NULL,
    Height         DECIMAL(6,2) NULL,
    Weight         DECIMAL(6,2) NULL,
    BloodPressure  NVARCHAR(20) NULL,
    PulseRate      INT NULL,
    Temperature    DECIMAL(5,2) NULL,
    Comments       NVARCHAR(1000) NULL,
    RecordedAt     DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_VitalSign_Patient FOREIGN KEY (PatientId)
        REFERENCES Patient(PatientId) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Prescription' AND xtype='U')
CREATE TABLE Prescription (
    PrescriptionId INT IDENTITY(1,1) PRIMARY KEY,
    PatientId      INT NOT NULL,
    DoctorId       INT NULL,
    Diagnosis      NVARCHAR(1000) NULL,
    Notes          NVARCHAR(1000) NULL,
    CreatedAt      DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Prescription_Patient FOREIGN KEY (PatientId)
        REFERENCES Patient(PatientId) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='NextVisitDate' AND Object_ID=Object_ID('Prescription'))
    ALTER TABLE Prescription ADD NextVisitDate DATE NULL;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PrescriptionItem' AND xtype='U')
CREATE TABLE PrescriptionItem (
    ItemId          INT IDENTITY(1,1) PRIMARY KEY,
    PrescriptionId  INT NOT NULL,
    MedicationId    INT NULL,
    MedicineName    NVARCHAR(200) NULL,
    Dosage          NVARCHAR(100) NULL,
    Frequency       NVARCHAR(100) NULL,
    Duration        NVARCHAR(100) NULL,
    Instructions    NVARCHAR(500) NULL,
    CONSTRAINT FK_PrescriptionItem_Prescription FOREIGN KEY (PrescriptionId)
        REFERENCES Prescription(PrescriptionId) ON DELETE CASCADE
);

-- Lab tests ordered on a prescription (from the Test Master catalog). TestName
-- is snapshotted here (like PrescriptionItem does for MedicineName) so a
-- prescription still shows the correct name even if the test is later
-- renamed or deactivated in the catalog.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PrescriptionLabTest' AND xtype='U')
CREATE TABLE PrescriptionLabTest (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    PrescriptionId  INT NOT NULL,
    TestId          INT NOT NULL,
    TestName        NVARCHAR(200) NOT NULL,
    CONSTRAINT FK_PrescriptionLabTest_Prescription FOREIGN KEY (PrescriptionId)
        REFERENCES Prescription(PrescriptionId) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PatientConfirmation' AND xtype='U')
CREATE TABLE PatientConfirmation (
    ConfirmId    INT IDENTITY(1,1) PRIMARY KEY,
    PatientId    INT NOT NULL,
    TokenNo      INT NULL,
    Status       NVARCHAR(20) NOT NULL DEFAULT 'Confirmed',
    ConfirmedAt  DATETIME NOT NULL DEFAULT GETDATE(),
    Notes        NVARCHAR(500) NULL,
    CONSTRAINT FK_PatientConfirmation_Patient FOREIGN KEY (PatientId)
        REFERENCES Patient(PatientId) ON DELETE CASCADE
);

-- Add TokenNo / Status if the table already existed without them
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='TokenNo' AND Object_ID=Object_ID('PatientConfirmation'))
    ALTER TABLE PatientConfirmation ADD TokenNo INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Status' AND Object_ID=Object_ID('PatientConfirmation'))
    ALTER TABLE PatientConfirmation ADD Status NVARCHAR(20) NOT NULL DEFAULT 'Confirmed';

-- Migrate status labels to the current workflow set:
-- Confirm, Pre-Examine, Examine, Billing, Completed
UPDATE PatientConfirmation SET Status = 'Confirm'     WHERE Status IN ('Confirmed');
UPDATE PatientConfirmation SET Status = 'Pre-Examine' WHERE Status IN ('Vital', 'Pre Examine');
UPDATE PatientConfirmation SET Status = 'Examine'     WHERE Status IN ('Doctor');
UPDATE PatientConfirmation SET Status = 'Billing'     WHERE Status IN ('Pharmacy', 'Exit');
-- NOTE: 'Completed' is NOT migrated away here — it's back as the real final
-- status (set once Billing -> Patient Bill saves a patient's fees), so an
-- unconditional rewrite here would silently un-complete already-billed visits
-- on every future init-db run.

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AppUser' AND xtype='U')
CREATE TABLE AppUser (
    UserId        INT IDENTITY(1,1) PRIMARY KEY,
    Username      NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash  NVARCHAR(256) NOT NULL,
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedAt     DATETIME NOT NULL DEFAULT GETDATE()
);

-- Role gates what a login can see: Admin/Doctor can browse every patient's
-- documents, Patient logins are always locked to their own LinkedPatientId
-- (enforced server-side in patientDocuments routes, not just hidden in UI).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Role' AND Object_ID=Object_ID('AppUser'))
    ALTER TABLE AppUser ADD Role NVARCHAR(20) NOT NULL DEFAULT 'Staff';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='LinkedPatientId' AND Object_ID=Object_ID('AppUser'))
    ALTER TABLE AppUser ADD LinkedPatientId INT NULL;

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_AppUser_Patient')
    ALTER TABLE AppUser ADD CONSTRAINT FK_AppUser_Patient FOREIGN KEY (LinkedPatientId)
        REFERENCES Patient(PatientId) ON DELETE SET NULL;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MenuAccess' AND xtype='U')
CREATE TABLE MenuAccess (
    AccessId     INT IDENTITY(1,1) PRIMARY KEY,
    UserId       INT NOT NULL,
    MenuKey      NVARCHAR(100) NOT NULL,
    AccessLevel  NVARCHAR(20) NOT NULL DEFAULT 'No Access',
    CONSTRAINT UQ_MenuAccess UNIQUE (UserId, MenuKey),
    CONSTRAINT FK_MenuAccess_User FOREIGN KEY (UserId)
        REFERENCES AppUser(UserId) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ClinicDetails' AND xtype='U')
CREATE TABLE ClinicDetails (
    ClinicId                 INT PRIMARY KEY,
    Name                     NVARCHAR(200) NOT NULL DEFAULT '',
    Address                  NVARCHAR(500) NULL,
    Latitude                DECIMAL(10,7) NULL,
    Longitude               DECIMAL(10,7) NULL,
    MapUrl                  NVARCHAR(1000) NULL,
    PrescriptionAttachment  NVARCHAR(MAX) NULL,
    UpdatedAt                DATETIME NOT NULL DEFAULT GETDATE()
);

-- Attachment print size (cm), added after initial release
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='AttachmentHeight' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD AttachmentHeight DECIMAL(6,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='AttachmentWidth' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD AttachmentWidth DECIMAL(6,2) NULL;

-- Widened from INT (px) to DECIMAL (cm); safe no-op if already DECIMAL
ALTER TABLE ClinicDetails ALTER COLUMN AttachmentHeight DECIMAL(6,2) NULL;
ALTER TABLE ClinicDetails ALTER COLUMN AttachmentWidth DECIMAL(6,2) NULL;

-- Clinic Details redesign: doctor name, logo, email, contact number
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='DoctorName' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD DoctorName NVARCHAR(200) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Logo' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD Logo NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Email' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD Email NVARCHAR(200) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ContactNo' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD ContactNo NVARCHAR(20) NULL;

-- Printed prescription page size (cm), sets the physical paper size via @page
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='PageHeight' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD PageHeight DECIMAL(6,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='PageWidth' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD PageWidth DECIMAL(6,2) NULL;

-- Software brand name (sidebar/login/browser tab) — distinct from the clinic's
-- own name, which is what shows in the top header and PWA install name.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='AppName' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD AppName NVARCHAR(100) NULL;

-- Positions of the drag-and-drop parameter blocks (Vital Sign / Medication)
-- placed on the PrescriptionAttachment letterhead image — stored as a JSON
-- array of { id, type, x, y } (x/y are percentages, so placement stays
-- correct regardless of how large the image is shown on screen).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='LetterPadFields' AND Object_ID=Object_ID('ClinicDetails'))
    ALTER TABLE ClinicDetails ADD LetterPadFields NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Pharmacy' AND xtype='U')
CREATE TABLE Pharmacy (
    PharmacyId  INT IDENTITY(1,1) PRIMARY KEY,
    Name        NVARCHAR(200) NOT NULL,
    Address     NVARCHAR(500) NULL,
    ContactNo   NVARCHAR(20) NULL,
    CreatedAt   DATETIME NOT NULL DEFAULT GETDATE()
);

-- Pharmacy > Supplier master: medicine suppliers used for stock purchases.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Supplier' AND xtype='U')
CREATE TABLE Supplier (
    SupplierId  INT IDENTITY(1,1) PRIMARY KEY,
    Name        NVARCHAR(200) NOT NULL,
    ContactNo   NVARCHAR(20) NULL,
    Address     NVARCHAR(500) NULL,
    GSTNo       NVARCHAR(30) NULL,
    IsActive    BIT NOT NULL DEFAULT 1,
    CreatedAt   DATETIME NOT NULL DEFAULT GETDATE()
);

-- Pharmacy > Purchase > Vendor Master: vendors' company, contact and
-- licensing details (GST No, Drug Licence No).
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Vendor' AND xtype='U')
CREATE TABLE Vendor (
    VendorId       INT IDENTITY(1,1) PRIMARY KEY,
    VendorName     NVARCHAR(200) NOT NULL,
    CompanyName    NVARCHAR(200) NULL,
    ContactPerson  NVARCHAR(150) NULL,
    ContactNo      NVARCHAR(20) NULL,
    AlternateNo    NVARCHAR(20) NULL,
    Address        NVARCHAR(500) NULL,
    GSTNo          NVARCHAR(30) NULL,
    DLNo           NVARCHAR(50) NULL,
    Email          NVARCHAR(150) NULL,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedAt      DATETIME NOT NULL DEFAULT GETDATE()
);

-- Vendor Master's address block and second drug licence. Status is the
-- Active / Inactive choice on the form; IsActive stays the soft-delete flag.
-- ContactNo is the Mobile No and AlternateNo the Phone No on the form.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='State' AND Object_ID=Object_ID('Vendor'))
    ALTER TABLE Vendor ADD State NVARCHAR(60) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Pincode' AND Object_ID=Object_ID('Vendor'))
    ALTER TABLE Vendor ADD Pincode NVARCHAR(6) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='DLNo2' AND Object_ID=Object_ID('Vendor'))
    ALTER TABLE Vendor ADD DLNo2 NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Status' AND Object_ID=Object_ID('Vendor'))
    ALTER TABLE Vendor ADD Status NVARCHAR(10) NOT NULL DEFAULT 'Active';

-- Pharmacy Item's Generic Name and Manufacturer, promoted from free text to
-- their own small master lists (same pattern as Supplier) so they're
-- selected from a fixed, reusable set instead of being retyped per item.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='GenericNameMaster' AND xtype='U')
CREATE TABLE GenericNameMaster (
    GenericNameId INT IDENTITY(1,1) PRIMARY KEY,
    Name          NVARCHAR(200) NOT NULL,
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedAt     DATETIME NOT NULL DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ManufacturerMaster' AND xtype='U')
CREATE TABLE ManufacturerMaster (
    ManufacturerId INT IDENTITY(1,1) PRIMARY KEY,
    Name           NVARCHAR(200) NOT NULL,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedAt      DATETIME NOT NULL DEFAULT GETDATE()
);

-- Same pattern again for Item Type and Unit — both start pre-seeded (below)
-- with a standard pharmacy list, then grow the same way Supplier does: pick
-- from the list, or type a new one to add it right from the Item form.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ItemTypeMaster' AND xtype='U')
CREATE TABLE ItemTypeMaster (
    ItemTypeId INT IDENTITY(1,1) PRIMARY KEY,
    Name       NVARCHAR(100) NOT NULL,
    IsActive   BIT NOT NULL DEFAULT 1,
    CreatedAt  DATETIME NOT NULL DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UnitMaster' AND xtype='U')
CREATE TABLE UnitMaster (
    UnitId    INT IDENTITY(1,1) PRIMARY KEY,
    Name      NVARCHAR(50) NOT NULL,
    IsActive  BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
);

-- Pharmacy > Item master: stock items carried by the pharmacy, independent of
-- the Medication catalog used for prescriptions.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PharmacyItem' AND xtype='U')
CREATE TABLE PharmacyItem (
    ItemId      INT IDENTITY(1,1) PRIMARY KEY,
    Name        NVARCHAR(200) NOT NULL,
    Unit        NVARCHAR(50) NULL,
    Category    NVARCHAR(100) NULL,
    HSNCode     NVARCHAR(30) NULL,
    IsActive    BIT NOT NULL DEFAULT 1,
    CreatedAt   DATETIME NOT NULL DEFAULT GETDATE()
);

-- Item master detail fields added after the initial release — ItemCode is
-- deliberately not a stored column: it's derived from ItemId at query time
-- (see routes/pharmacyItem.js), so there's no generation/uniqueness logic to
-- maintain here.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ItemType' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD ItemType NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Manufacturer' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD Manufacturer NVARCHAR(200) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='SupplierId' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD SupplierId INT NULL;
-- GenericNameId/ManufacturerId supersede the free-text GenericName/Manufacturer
-- columns above (kept only so any already-entered values aren't lost; no
-- longer read or written by the API — see routes/pharmacyItem.js).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='GenericNameId' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD GenericNameId INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ManufacturerId' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD ManufacturerId INT NULL;
-- ItemTypeId/UnitId likewise supersede the free-text ItemType/Unit columns above.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ItemTypeId' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD ItemTypeId INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='UnitId' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD UnitId INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ScheduleH' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD ScheduleH BIT NOT NULL DEFAULT 0;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ScheduleH1' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD ScheduleH1 BIT NOT NULL DEFAULT 0;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='GenericName' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD GenericName NVARCHAR(200) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='TabletName' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD TabletName NVARCHAR(200) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='PurchaseRate' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD PurchaseRate DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='GSTPercent' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD GSTPercent DECIMAL(5,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='MRP' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD MRP DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='SellPrice' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD SellPrice DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='DiscountPercent' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD DiscountPercent DECIMAL(5,2) NULL;
-- Where the item sits on the shelf — filled from the Bulk Itemlist upload template.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Rack' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD Rack NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='BoxNo' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD BoxNo NVARCHAR(50) NULL;
-- Pack size (e.g. 10's, 1x15) — typed in Bulk Itemlist or uploaded with its template.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Pack' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD Pack NVARCHAR(50) NULL;
-- Last save from Bulk Itemlist's row edit; that screen moves edited items to the bottom of their page.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='EditedAt' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD EditedAt DATETIME NULL;

-- Manually-entered Doctor Fees / Extra Fees per patient per day, layered on top
-- of the auto-calculated visit rate on the Billing > Patient Bill screen.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PatientBill' AND xtype='U')
CREATE TABLE PatientBill (
    BillId       INT IDENTITY(1,1) PRIMARY KEY,
    PatientId    INT NOT NULL,
    BillDate     DATE NOT NULL,
    DoctorFees   DECIMAL(10,2) NOT NULL DEFAULT 0,
    ExtraFees    DECIMAL(10,2) NOT NULL DEFAULT 0,
    Notes        NVARCHAR(500) NULL,
    CreatedAt    DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt    DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_PatientBill_PatientDate UNIQUE (PatientId, BillDate),
    CONSTRAINT FK_PatientBill_Patient FOREIGN KEY (PatientId)
        REFERENCES Patient(PatientId) ON DELETE CASCADE
);

-- Which doctor this bill's Doctor Fees came from (picked on the Patient Bill
-- screen). SET NULL on delete so removing a doctor never touches billing history.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='DoctorId' AND Object_ID=Object_ID('PatientBill'))
    ALTER TABLE PatientBill ADD DoctorId INT NULL;

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_PatientBill_Doctor')
    ALTER TABLE PatientBill ADD CONSTRAINT FK_PatientBill_Doctor FOREIGN KEY (DoctorId)
        REFERENCES Employee(EmployeeId) ON DELETE SET NULL;

-- Gmail account configs for the Mail Configuration screen (IMAP folder
-- browsing + SMTP send). Password is stored AES-encrypted, never plain text.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MailConfig' AND xtype='U')
CREATE TABLE MailConfig (
    MailConfigId       INT IDENTITY(1,1) PRIMARY KEY,
    GmailId             NVARCHAR(200) NOT NULL,
    PasswordEncrypted   NVARCHAR(MAX) NOT NULL,
    FolderName          NVARCHAR(200) NOT NULL DEFAULT 'INBOX',
    IsActive            BIT NOT NULL DEFAULT 1,
    CreatedAt           DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt           DATETIME NOT NULL DEFAULT GETDATE()
);

-- Google Drive OAuth connections (Mail Configuration > Google Drive Folder
-- Access). Tokens are AES-encrypted, never plain text.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DriveConnection' AND xtype='U')
CREATE TABLE DriveConnection (
    DriveConnectionId     INT IDENTITY(1,1) PRIMARY KEY,
    GoogleEmail            NVARCHAR(200) NULL,
    AccessTokenEncrypted   NVARCHAR(MAX) NULL,
    RefreshTokenEncrypted  NVARCHAR(MAX) NULL,
    TokenExpiry             DATETIME NULL,
    FolderId                NVARCHAR(200) NULL,
    FolderName              NVARCHAR(200) NULL,
    IsActive                BIT NOT NULL DEFAULT 1,
    CreatedAt               DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt               DATETIME NOT NULL DEFAULT GETDATE()
);

-- Patient records/attachments stored in Google Drive (via a single service
-- account connection, not per-user OAuth). This table only indexes them —
-- the files themselves live in Drive. Admin/Doctor can browse any patient's
-- documents; a Patient-role login is always restricted server-side to its
-- own LinkedPatientId (see backend/src/routes/patientDocuments.js).
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PatientDocument' AND xtype='U')
CREATE TABLE PatientDocument (
    DocumentId    INT IDENTITY(1,1) PRIMARY KEY,
    PatientId     INT NOT NULL,
    FileName      NVARCHAR(300) NOT NULL,
    DriveFileId   NVARCHAR(200) NOT NULL,
    Category      NVARCHAR(100) NULL,
    DocumentDate  DATE NOT NULL,
    UploadedBy    NVARCHAR(100) NULL,
    CreatedAt     DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_PatientDocument_Patient FOREIGN KEY (PatientId)
        REFERENCES Patient(PatientId) ON DELETE CASCADE
);

-- Storage is provider-agnostic (Cloudinary now, Google Drive later — see
-- backend/src/utils/cloudinaryService.js / googleDriveService.js). DriveFileId
-- predates this and is left frozen/unused; the table had zero real rows when
-- this was added, so relaxing it to nullable is safe.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='StorageProvider' AND Object_ID=Object_ID('PatientDocument'))
    ALTER TABLE PatientDocument ADD StorageProvider NVARCHAR(20) NOT NULL DEFAULT 'cloudinary';
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='StorageFileId' AND Object_ID=Object_ID('PatientDocument'))
    ALTER TABLE PatientDocument ADD StorageFileId NVARCHAR(400) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='StorageResourceType' AND Object_ID=Object_ID('PatientDocument'))
    ALTER TABLE PatientDocument ADD StorageResourceType NVARCHAR(20) NULL;
IF EXISTS (SELECT * FROM sys.columns WHERE Name='DriveFileId' AND Object_ID=Object_ID('PatientDocument') AND is_nullable = 0)
    ALTER TABLE PatientDocument ALTER COLUMN DriveFileId NVARCHAR(200) NULL;

-- Pharmacy > Purchase/Sales: four structurally-identical transaction types
-- (a header + line items, each line against a PharmacyItem) — Purchase
-- Invoice/Return are against a Supplier; Sales Billing/Return are against a
-- free-text customer name (walk-in sales, not tied to the Patient table).
-- Basic record-keeping only for now — no stock-quantity effects yet.
-- See routes/_transactionFactory.js, which both routing and the frontend's
-- shared TransactionPage drive off this same shape.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PurchaseInvoice' AND xtype='U')
CREATE TABLE PurchaseInvoice (
    PurchaseInvoiceId INT IDENTITY(1,1) PRIMARY KEY,
    TransDate         DATE NOT NULL,
    SupplierId        INT NULL,
    TotalAmount       DECIMAL(12,2) NOT NULL DEFAULT 0,
    IsActive          BIT NOT NULL DEFAULT 1,
    CreatedAt         DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_PurchaseInvoice_Supplier FOREIGN KEY (SupplierId) REFERENCES Supplier(SupplierId)
);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PurchaseInvoiceItem' AND xtype='U')
CREATE TABLE PurchaseInvoiceItem (
    LineId            INT IDENTITY(1,1) PRIMARY KEY,
    PurchaseInvoiceId INT NOT NULL,
    ItemId            INT NOT NULL,
    Quantity          DECIMAL(10,2) NOT NULL,
    Rate              DECIMAL(10,2) NOT NULL,
    Amount            DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_PurchaseInvoiceItem_Header FOREIGN KEY (PurchaseInvoiceId) REFERENCES PurchaseInvoice(PurchaseInvoiceId) ON DELETE CASCADE,
    CONSTRAINT FK_PurchaseInvoiceItem_Item FOREIGN KEY (ItemId) REFERENCES PharmacyItem(ItemId)
);

-- Purchase Invoice's line-item grid carries a lot more per-line detail than
-- the other three transaction types (Rack/Batch/Expiry are specific to this
-- purchase; Manufacturer/Pack/MRP/Discount/GST/HSN start out copied from the
-- item master when picked, but can be overridden per line since a given
-- batch can legitimately differ from the catalog's current values).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Rack' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD Rack NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ManufacturerName' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD ManufacturerName NVARCHAR(200) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Pack' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD Pack NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Batch' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD Batch NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ExpiryDate' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD ExpiryDate DATE NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='OldMRP' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD OldMRP DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='FreeQty' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD FreeQty DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='MRP' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD MRP DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='DiscountPercent' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD DiscountPercent DECIMAL(5,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='GSTPercent' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD GSTPercent DECIMAL(5,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='TaxableValue' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD TaxableValue DECIMAL(12,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='HSNCode' AND Object_ID=Object_ID('PurchaseInvoiceItem'))
    ALTER TABLE PurchaseInvoiceItem ADD HSNCode NVARCHAR(30) NULL;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PurchaseReturn' AND xtype='U')
CREATE TABLE PurchaseReturn (
    PurchaseReturnId INT IDENTITY(1,1) PRIMARY KEY,
    TransDate        DATE NOT NULL,
    SupplierId       INT NULL,
    TotalAmount      DECIMAL(12,2) NOT NULL DEFAULT 0,
    IsActive         BIT NOT NULL DEFAULT 1,
    CreatedAt        DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_PurchaseReturn_Supplier FOREIGN KEY (SupplierId) REFERENCES Supplier(SupplierId)
);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PurchaseReturnItem' AND xtype='U')
CREATE TABLE PurchaseReturnItem (
    LineId           INT IDENTITY(1,1) PRIMARY KEY,
    PurchaseReturnId INT NOT NULL,
    ItemId           INT NOT NULL,
    Quantity         DECIMAL(10,2) NOT NULL,
    Rate             DECIMAL(10,2) NOT NULL,
    Amount           DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_PurchaseReturnItem_Header FOREIGN KEY (PurchaseReturnId) REFERENCES PurchaseReturn(PurchaseReturnId) ON DELETE CASCADE,
    CONSTRAINT FK_PurchaseReturnItem_Item FOREIGN KEY (ItemId) REFERENCES PharmacyItem(ItemId)
);

-- Invoice-based return: which Purchase Invoice this return was raised against
-- (nullable — a return can still be recorded without one), plus the Batch/Expiry
-- carried over from that invoice's line so the return stays tied to the exact
-- batch being sent back, not just the item in general.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='PurchaseInvoiceId' AND Object_ID=Object_ID('PurchaseReturn'))
    ALTER TABLE PurchaseReturn ADD PurchaseInvoiceId INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Batch' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD Batch NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ExpiryDate' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD ExpiryDate DATE NULL;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SalesBilling' AND xtype='U')
CREATE TABLE SalesBilling (
    SalesBillingId INT IDENTITY(1,1) PRIMARY KEY,
    TransDate      DATE NOT NULL,
    CustomerName   NVARCHAR(200) NULL,
    TotalAmount    DECIMAL(12,2) NOT NULL DEFAULT 0,
    IsActive       BIT NOT NULL DEFAULT 1,
    CreatedAt      DATETIME NOT NULL DEFAULT GETDATE()
);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SalesBillingItem' AND xtype='U')
CREATE TABLE SalesBillingItem (
    LineId         INT IDENTITY(1,1) PRIMARY KEY,
    SalesBillingId INT NOT NULL,
    ItemId         INT NOT NULL,
    Quantity       DECIMAL(10,2) NOT NULL,
    Rate           DECIMAL(10,2) NOT NULL,
    Amount         DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_SalesBillingItem_Header FOREIGN KEY (SalesBillingId) REFERENCES SalesBilling(SalesBillingId) ON DELETE CASCADE,
    CONSTRAINT FK_SalesBillingItem_Item FOREIGN KEY (ItemId) REFERENCES PharmacyItem(ItemId)
);

-- Which purchased batch a sale was fulfilled from, so Stock's batch-wise
-- available quantity can account for sales too (not just purchases/returns).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Batch' AND Object_ID=Object_ID('SalesBillingItem'))
    ALTER TABLE SalesBillingItem ADD Batch NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ExpiryDate' AND Object_ID=Object_ID('SalesBillingItem'))
    ALTER TABLE SalesBillingItem ADD ExpiryDate DATE NULL;

-- Sales (counter sale): the customer's mobile and who saved the bill.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='MobileNo' AND Object_ID=Object_ID('SalesBilling'))
    ALTER TABLE SalesBilling ADD MobileNo NVARCHAR(20) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='CreatedBy' AND Object_ID=Object_ID('SalesBilling'))
    ALTER TABLE SalesBilling ADD CreatedBy NVARCHAR(100) NULL;

-- Stock changes that have no document of their own: an item's opening stock
-- and quantity adjustments. Purchases, returns and sales are read from their
-- own tables, so the Stock Report's history is this table plus those.
-- Reason: 'opening' | 'adjustment'.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='StockMovement' AND xtype='U')
CREATE TABLE StockMovement (
    MovementId  INT IDENTITY(1,1) PRIMARY KEY,
    ItemId      INT NOT NULL,
    QtyChange   DECIMAL(10,2) NOT NULL,
    Reason      NVARCHAR(20) NOT NULL,
    RefType     NVARCHAR(30) NULL,
    RefId       INT NULL,
    VendorId    INT NULL,
    Note        NVARCHAR(300) NULL,
    CreatedBy   NVARCHAR(100) NULL,
    CreatedAt   DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_StockMovement_Item FOREIGN KEY (ItemId) REFERENCES PharmacyItem(ItemId)
);

-- Item Master: GST split into CGST + SGST (GSTPercent stays their sum, for
-- billing), Potency, and an Active / Inactive status (IsActive stays the
-- soft-delete flag).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='CGSTPercent' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD CGSTPercent DECIMAL(5,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='SGSTPercent' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD SGSTPercent DECIMAL(5,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Potency' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD Potency NVARCHAR(50) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='Status' AND Object_ID=Object_ID('PharmacyItem'))
    ALTER TABLE PharmacyItem ADD Status NVARCHAR(10) NOT NULL DEFAULT 'Active';

-- Item Master's Category and Potency pick-lists (items store the text). Delete
-- only hides a value; SortOrder keeps the seeded values in their usual order.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CategoryMaster' AND xtype='U')
CREATE TABLE CategoryMaster (
    CategoryId INT IDENTITY(1,1) PRIMARY KEY,
    Name       NVARCHAR(100) NOT NULL,
    SortOrder  INT NOT NULL DEFAULT 0,
    IsActive   BIT NOT NULL DEFAULT 1,
    CreatedAt  DATETIME NOT NULL DEFAULT GETDATE()
);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PotencyMaster' AND xtype='U')
CREATE TABLE PotencyMaster (
    PotencyId  INT IDENTITY(1,1) PRIMARY KEY,
    Name       NVARCHAR(50) NOT NULL,
    SortOrder  INT NOT NULL DEFAULT 0,
    IsActive   BIT NOT NULL DEFAULT 1,
    CreatedAt  DATETIME NOT NULL DEFAULT GETDATE()
);

-- Pharmacy > Purchase / Order: an order placed with a vendor (it doesn't
-- change stock). Each line copies the item's details as they were, so an old
-- order keeps them after the item changes. Number: SC-PO0001 from the id.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PurchaseOrder' AND xtype='U')
CREATE TABLE PurchaseOrder (
    PurchaseOrderId INT IDENTITY(1,1) PRIMARY KEY,
    OrderDate       DATE NOT NULL,
    VendorId        INT NOT NULL,
    VendorDetails   NVARCHAR(1000) NULL,
    TotalAmount     DECIMAL(12,2) NOT NULL DEFAULT 0,
    CreatedBy       NVARCHAR(100) NULL,
    IsActive        BIT NOT NULL DEFAULT 1,
    CreatedAt       DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_PurchaseOrder_Vendor FOREIGN KEY (VendorId) REFERENCES Vendor(VendorId)
);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PurchaseOrderItem' AND xtype='U')
CREATE TABLE PurchaseOrderItem (
    LineId           INT IDENTITY(1,1) PRIMARY KEY,
    PurchaseOrderId  INT NOT NULL,
    ItemId           INT NOT NULL,
    ItemName         NVARCHAR(200) NOT NULL,
    GenericName      NVARCHAR(200) NULL,
    Manufacturer     NVARCHAR(200) NULL,
    HSNCode          NVARCHAR(30) NULL,
    Category         NVARCHAR(100) NULL,
    Pack             NVARCHAR(50) NULL,
    MRP              DECIMAL(10,2) NOT NULL,
    DiscPercent      DECIMAL(5,2) NOT NULL DEFAULT 0,
    Rate             DECIMAL(10,2) NOT NULL,
    Quantity         DECIMAL(10,2) NOT NULL,
    Amount           DECIMAL(12,2) NOT NULL,
    CGSTPercent      DECIMAL(5,2) NOT NULL DEFAULT 0,
    SGSTPercent      DECIMAL(5,2) NOT NULL DEFAULT 0,
    GSTPercent       DECIMAL(5,2) NOT NULL DEFAULT 0,
    GSTAmount        DECIMAL(12,2) NOT NULL DEFAULT 0,
    Total            DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_PurchaseOrderItem_Header FOREIGN KEY (PurchaseOrderId) REFERENCES PurchaseOrder(PurchaseOrderId) ON DELETE CASCADE,
    CONSTRAINT FK_PurchaseOrderItem_Item FOREIGN KEY (ItemId) REFERENCES PharmacyItem(ItemId)
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SalesReturn' AND xtype='U')
CREATE TABLE SalesReturn (
    SalesReturnId INT IDENTITY(1,1) PRIMARY KEY,
    TransDate     DATE NOT NULL,
    CustomerName  NVARCHAR(200) NULL,
    TotalAmount   DECIMAL(12,2) NOT NULL DEFAULT 0,
    IsActive      BIT NOT NULL DEFAULT 1,
    CreatedAt     DATETIME NOT NULL DEFAULT GETDATE()
);
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SalesReturnItem' AND xtype='U')
CREATE TABLE SalesReturnItem (
    LineId        INT IDENTITY(1,1) PRIMARY KEY,
    SalesReturnId INT NOT NULL,
    ItemId        INT NOT NULL,
    Quantity      DECIMAL(10,2) NOT NULL,
    Rate          DECIMAL(10,2) NOT NULL,
    Amount        DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_SalesReturnItem_Header FOREIGN KEY (SalesReturnId) REFERENCES SalesReturn(SalesReturnId) ON DELETE CASCADE,
    CONSTRAINT FK_SalesReturnItem_Item FOREIGN KEY (ItemId) REFERENCES PharmacyItem(ItemId)
);

-- Pharmacy > Purchase > Purchase Master: which item is bought from which
-- vendor, in what quantity and unit.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PurchaseMaster' AND xtype='U')
CREATE TABLE PurchaseMaster (
    PurchaseMasterId INT IDENTITY(1,1) PRIMARY KEY,
    ItemId           INT NOT NULL,
    VendorId         INT NOT NULL,
    Quantity         DECIMAL(10,2) NOT NULL,
    UnitId           INT NULL,
    IsActive         BIT NOT NULL DEFAULT 1,
    CreatedAt        DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_PurchaseMaster_Item FOREIGN KEY (ItemId) REFERENCES PharmacyItem(ItemId),
    CONSTRAINT FK_PurchaseMaster_Vendor FOREIGN KEY (VendorId) REFERENCES Vendor(VendorId),
    CONSTRAINT FK_PurchaseMaster_Unit FOREIGN KEY (UnitId) REFERENCES UnitMaster(UnitId)
);

-- Purchase Master's pricing fields: HSN and manufacturer (prefilled from the
-- item), the item's previous and current price, GST / discount % and the
-- resulting net price.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='HSNCode' AND Object_ID=Object_ID('PurchaseMaster'))
    ALTER TABLE PurchaseMaster ADD HSNCode NVARCHAR(20) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ManufacturerId' AND Object_ID=Object_ID('PurchaseMaster'))
    ALTER TABLE PurchaseMaster ADD ManufacturerId INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='OldPrice' AND Object_ID=Object_ID('PurchaseMaster'))
    ALTER TABLE PurchaseMaster ADD OldPrice DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='CurrentPrice' AND Object_ID=Object_ID('PurchaseMaster'))
    ALTER TABLE PurchaseMaster ADD CurrentPrice DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='GSTPercent' AND Object_ID=Object_ID('PurchaseMaster'))
    ALTER TABLE PurchaseMaster ADD GSTPercent DECIMAL(5,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='DiscountPercent' AND Object_ID=Object_ID('PurchaseMaster'))
    ALTER TABLE PurchaseMaster ADD DiscountPercent DECIMAL(5,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='NetPrice' AND Object_ID=Object_ID('PurchaseMaster'))
    ALTER TABLE PurchaseMaster ADD NetPrice DECIMAL(12,2) NULL;

-- Purchase Return's single-entry form: the bill's date and vendor on the
-- header, and the line's HSN / manufacturer / unit and pricing (as on Stock
-- Inward). Current Price is also the line's Rate, Net Price its Amount.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='BillDate' AND Object_ID=Object_ID('PurchaseReturn'))
    ALTER TABLE PurchaseReturn ADD BillDate DATE NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='VendorId' AND Object_ID=Object_ID('PurchaseReturn'))
    ALTER TABLE PurchaseReturn ADD VendorId INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='HSNCode' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD HSNCode NVARCHAR(20) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='ManufacturerId' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD ManufacturerId INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='UnitId' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD UnitId INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='OldPrice' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD OldPrice DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='CurrentPrice' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD CurrentPrice DECIMAL(10,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='GSTPercent' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD GSTPercent DECIMAL(5,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='DiscountPercent' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD DiscountPercent DECIMAL(5,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='NetPrice' AND Object_ID=Object_ID('PurchaseReturnItem'))
    ALTER TABLE PurchaseReturnItem ADD NetPrice DECIMAL(12,2) NULL;

-- Pharmacy > Stock > Inward: stock received against a Purchase Invoice (its
-- Purchase Code), batch by batch. Counted as purchased stock on the Stock
-- screen. ExpiryDate is stored as the last day of the expiry month.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='StockInward' AND xtype='U')
CREATE TABLE StockInward (
    StockInwardId     INT IDENTITY(1,1) PRIMARY KEY,
    PurchaseInvoiceId INT NULL,
    BillDate          DATE NULL,
    ItemId            INT NOT NULL,
    HSNCode           NVARCHAR(20) NULL,
    ManufacturerId    INT NULL,
    VendorId          INT NOT NULL,
    Quantity          DECIMAL(10,2) NOT NULL,
    UnitId            INT NULL,
    Batch             NVARCHAR(50) NULL,
    ExpiryDate        DATE NULL,
    OldPrice          DECIMAL(10,2) NULL,
    CurrentPrice      DECIMAL(10,2) NULL,
    GSTPercent        DECIMAL(5,2) NULL,
    DiscountPercent   DECIMAL(5,2) NULL,
    NetPrice          DECIMAL(12,2) NULL,
    IsActive          BIT NOT NULL DEFAULT 1,
    CreatedAt         DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_StockInward_Invoice FOREIGN KEY (PurchaseInvoiceId) REFERENCES PurchaseInvoice(PurchaseInvoiceId),
    CONSTRAINT FK_StockInward_Item FOREIGN KEY (ItemId) REFERENCES PharmacyItem(ItemId),
    CONSTRAINT FK_StockInward_Vendor FOREIGN KEY (VendorId) REFERENCES Vendor(VendorId),
    CONSTRAINT FK_StockInward_Unit FOREIGN KEY (UnitId) REFERENCES UnitMaster(UnitId),
    CONSTRAINT FK_StockInward_Manufacturer FOREIGN KEY (ManufacturerId) REFERENCES ManufacturerMaster(ManufacturerId)
);
`;

async function init() {
  try {
    const pool = await getPool();
    await pool.request().batch(schema);

    // Added as its own query, after SupplierId is guaranteed to exist from the
    // batch above — an ADD CONSTRAINT in the same batch as the conditional ADD
    // COLUMN it references hits the same same-batch resolution issue noted above.
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_PharmacyItem_Supplier')
          ALTER TABLE PharmacyItem ADD CONSTRAINT FK_PharmacyItem_Supplier FOREIGN KEY (SupplierId)
              REFERENCES Supplier(SupplierId);
      IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_PharmacyItem_GenericName')
          ALTER TABLE PharmacyItem ADD CONSTRAINT FK_PharmacyItem_GenericName FOREIGN KEY (GenericNameId)
              REFERENCES GenericNameMaster(GenericNameId);
      IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_PharmacyItem_Manufacturer')
          ALTER TABLE PharmacyItem ADD CONSTRAINT FK_PharmacyItem_Manufacturer FOREIGN KEY (ManufacturerId)
              REFERENCES ManufacturerMaster(ManufacturerId);
      IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_PharmacyItem_ItemType')
          ALTER TABLE PharmacyItem ADD CONSTRAINT FK_PharmacyItem_ItemType FOREIGN KEY (ItemTypeId)
              REFERENCES ItemTypeMaster(ItemTypeId);
      IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_PharmacyItem_Unit')
          ALTER TABLE PharmacyItem ADD CONSTRAINT FK_PharmacyItem_Unit FOREIGN KEY (UnitId)
              REFERENCES UnitMaster(UnitId);
      IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_PurchaseReturn_Invoice')
          ALTER TABLE PurchaseReturn ADD CONSTRAINT FK_PurchaseReturn_Invoice FOREIGN KEY (PurchaseInvoiceId)
              REFERENCES PurchaseInvoice(PurchaseInvoiceId);
    `);

    // One-time seed of the standard Item Type / Unit lists — only inserts
    // names not already present, so it's safe to run on every init-db (e.g.
    // after a user has already added their own custom ones).
    const ITEM_TYPE_SEED = [
      'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection',
      'Eye Drops', 'Ear Drops', 'Nasal Drops',
      'Cream', 'Ointment', 'Gel', 'Lotion', 'Powder', 'Sachet', 'Inhaler', 'Spray',
      'Solution', 'Mouthwash', 'Soap', 'Shampoo', 'Suppository',
      'Surgical / Medical Consumables', 'Medical Device', 'Other',
    ];
    const UNIT_SEED = [
      'Tablet', 'Capsule', 'Strip', 'Bottle', 'Vial', 'Ampoule', 'Tube', 'Sachet',
      'Box', 'Pack', 'Piece', 'ml', 'Litre', 'Gram', 'Kg', 'Roll', 'Pair', 'Unit',
      'Set', 'Dozen', 'Nos',
    ];
    for (const name of ITEM_TYPE_SEED) {
      await pool.request().input('name', sql.NVarChar, name).query(`
        IF NOT EXISTS (SELECT * FROM ItemTypeMaster WHERE Name = @name)
          INSERT INTO ItemTypeMaster (Name) VALUES (@name)
      `);
    }
    for (const name of UNIT_SEED) {
      await pool.request().input('name', sql.NVarChar, name).query(`
        IF NOT EXISTS (SELECT * FROM UnitMaster WHERE Name = @name)
          INSERT INTO UnitMaster (Name) VALUES (@name)
      `);
    }

    // Item Master pick-lists: the Type / Unit values the Pharmacy spec starts
    // with (matched ignoring case, so 'Nos' covers 'nos'), the standard
    // potencies, and every category items already use.
    for (const name of ['nos', 'bottle', 'strip', 'tablet', 'ml', 'gm', 'dram', 'box', 'tube', 'sachet']) {
      await pool.request().input('name', sql.NVarChar, name).query(`
        IF NOT EXISTS (SELECT * FROM UnitMaster WHERE LOWER(Name) = LOWER(@name))
          INSERT INTO UnitMaster (Name) VALUES (@name)
      `);
    }
    for (const [i, name] of ['6C', '30C', '200C', '1M', '10M', 'Q'].entries()) {
      await pool.request().input('name', sql.NVarChar, name).input('sort', sql.Int, i + 1).query(`
        IF NOT EXISTS (SELECT * FROM PotencyMaster WHERE LOWER(Name) = LOWER(@name))
          INSERT INTO PotencyMaster (Name, SortOrder) VALUES (@name, @sort)
      `);
    }
    await pool.request().query(`
      INSERT INTO CategoryMaster (Name)
      SELECT DISTINCT LTRIM(RTRIM(i.Category)) FROM PharmacyItem i
      WHERE i.IsActive = 1 AND LTRIM(RTRIM(ISNULL(i.Category, ''))) <> ''
        AND NOT EXISTS (SELECT * FROM CategoryMaster c WHERE LOWER(c.Name) = LOWER(LTRIM(RTRIM(i.Category))));
      INSERT INTO PotencyMaster (Name)
      SELECT DISTINCT LTRIM(RTRIM(i.Potency)) FROM PharmacyItem i
      WHERE i.IsActive = 1 AND LTRIM(RTRIM(ISNULL(i.Potency, ''))) <> ''
        AND NOT EXISTS (SELECT * FROM PotencyMaster p WHERE LOWER(p.Name) = LOWER(LTRIM(RTRIM(i.Potency))));
    `);

    // Seed the default Admin user only if it doesn't already exist.
    const exists = await pool
      .request()
      .input('u', 'Admin')
      .query('SELECT COUNT(*) AS n FROM AppUser WHERE Username = @u');
    if (exists.recordset[0].n === 0) {
      await pool
        .request()
        .input('u', 'Admin')
        .input('p', hashPassword('Admin@1'))
        .query('INSERT INTO AppUser (Username, PasswordHash, IsActive) VALUES (@u, @p, 1)');
      console.log('Seeded default user: Admin');
    }

    // Backfill Role for the 3 original logins that predate the Role column
    // (and for the seed insert above, which has no Role of its own and so
    // takes the column's 'Staff' default) — run as its own query (not part
    // of `schema`) since a same-batch UPDATE referencing a column added by
    // a conditional ALTER in that same batch fails to bind in SQL Server.
    await pool.request().query(`
      UPDATE AppUser SET Role='Admin'     WHERE Username='Admin'     AND Role='Staff';
      UPDATE AppUser SET Role='Doctor'    WHERE Username='Doctor'    AND Role='Staff';
      UPDATE AppUser SET Role='Reception' WHERE Username='Reception' AND Role='Staff';
    `);

    console.log('Schema initialized successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Schema init failed:', err.message);
    process.exit(1);
  }
}

init();
