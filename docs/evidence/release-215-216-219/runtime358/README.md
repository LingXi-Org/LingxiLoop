# Formally published LingxiOS3.5.8

The exact source35ac1208fcf2bd6cb1852f474175e9eb7e2083ec passed both
[main release gates](https://github.com/LingXi-Org/LingxiOS/actions/runs/39400184326)
and [formal publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/39401752197).
The annotated tagv3.5.8 peels to that source. The main tree is identical to
independently reviewed PR37 head2f7137aa57a46aa4e3a21f833fc6821de4a6a3e6.

The actual GitHub Packages tarball was downloaded using the existing authorized
package-read environment, verified against registry SHA512 and SHA1, and compared
file-by-file with the qualified source candidate. All474 files match, including
compiled code, schema012/013, native015 migrations and the Python kernel.
The published tarball SHA256 is
ee308270402b220452f8eb4e92e9c1d25a68466525f21827203bd5078a9c1bcb.

All four root/server manifests and locks pin exactly3.5.8 with the recorded SRI.
The update changes only those runtime entries; the removed server self-link is
not reintroduced. Local final checks load the actual downloaded package from a
private package directory; other contributors' dependencies were not modified.
The prior source package is retained outside the checkout for comparison.

This receipt proves formal publication and package identity. It is not a
production deployment receipt. Native schema13 still requires the coordinated
maintenance window and cannot be served by old3.5.6 processes.

The independent PR234 package E401 and official-site TLS failure remain separate
failed acceptance attempts. No credentials were copied and no permissions or
certificate settings were changed to make either attempt pass.
