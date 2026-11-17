package trivy

default ignore = false

ignore {
    input.SeveritySource == "ubuntu"
}