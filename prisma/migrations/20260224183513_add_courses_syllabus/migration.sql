-- AlterTable
ALTER TABLE "User" ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "department_code" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "credit_hours" INTEGER NOT NULL,
    "classification" TEXT NOT NULL,
    "description" TEXT,
    "prerequisites" TEXT,
    "has_syllabus" BOOLEAN NOT NULL DEFAULT false,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabi" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "s3_bucket_name" TEXT NOT NULL,
    "s3_object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syllabi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_department_code_number_key" ON "courses"("department_code", "number");

-- CreateIndex
CREATE UNIQUE INDEX "syllabi_course_id_key" ON "syllabi"("course_id");

-- AddForeignKey
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
