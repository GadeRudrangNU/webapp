packer {
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
    googlecompute = {
      version = ">= 1.1.0"
      source  = "github.com/hashicorp/googlecompute"
    }
  }
}

variable "app_artifact" {
  type = string
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "aws_demo_account_id" {
  type = string
}

variable "gcp_project_id" {
  type = string
}

variable "gcp_zone" {
  type    = string
  default = "us-east1-b"
}

# ---------------- AWS AMI ----------------
source "amazon-ebs" "aws_ubuntu_2404" {
  region                      = var.aws_region
  instance_type               = "t2.micro"
  ssh_username                = "ubuntu"
  associate_public_ip_address = true
  ssh_interface               = "public_ip"

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    owners      = ["099720109477"] # Canonical
    most_recent = true
  }

  ami_name        = "csye6225-aws-{{timestamp}}"
  ami_description = "CSYE6225 WebApp AMI"
  ami_users       = [var.aws_demo_account_id] # share with DEMO AWS account
}

# ---------------- GCP IMAGE ----------------
source "googlecompute" "gcp_ubuntu_2404" {
  project_id              = var.gcp_project_id
  zone                    = var.gcp_zone
  ssh_username            = "packer"
  image_name              = "csye6225-gcp-{{timestamp}}"
  image_family            = "csye6225"
  image_description       = "CSYE6225 WebApp GCP Image"
  source_image_family     = "ubuntu-2404-lts-amd64"
  source_image_project_id = ["ubuntu-os-cloud"]
}

build {
  sources = [
    "source.amazon-ebs.aws_ubuntu_2404",
    "source.googlecompute.gcp_ubuntu_2404"
  ]

  # Upload artifact zip built on GitHub runner
  provisioner "file" {
    source      = var.app_artifact
    destination = "/tmp/webapp.zip"
  }

  # Upload systemd unit
  provisioner "file" {
    source      = "packer/systemd/csye6225.service"
    destination = "/tmp/csye6225.service"
  }

  # Install DB locally in image (assignment requirement)
  provisioner "shell" {
    script = "packer/scripts/install_postgres.sh"
  }

  # Install CloudWatch agent
  provisioner "shell" {
    script = "packer/scripts/install_cloudwatch_agent.sh"
  }

  # Bake CloudWatch config into the image
  provisioner "shell" {
    script = "packer/scripts/configure_cloudwatch.sh"
  }

  # Setup app + user + permissions + enable systemd
  provisioner "shell" {
    script = "packer/scripts/setup_app.sh"
  }
}